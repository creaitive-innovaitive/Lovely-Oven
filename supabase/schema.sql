-- Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists orders (
  id         bigint generated always as identity primary key,
  order_date date not null,
  customer   text not null,
  qty        int  not null default 1,
  food       text not null default '',
  pfood      int  not null default 0,
  extra      text not null default '',
  pextra     int  not null default 0,
  disc       int  not null default 0,
  paid       int  not null default 0,
  notes      text not null default '',
  oid        text not null default '',
  method     text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists meals (
  seq       bigint generated always as identity primary key,
  id        text unique not null,
  meal_date date not null,
  customer  text not null,
  status    text not null default 'Scheduled' check (status in ('Scheduled', 'Served', 'Cancelled')),
  oid       text not null default '',
  note      text not null default ''
);

create index if not exists orders_oid_idx on orders (oid);
create index if not exists meals_oid_idx on meals (oid);
create index if not exists meals_date_idx on meals (meal_date);

-- Only signed-in users can touch anything. The anon key in the website alone sees nothing.
alter table orders enable row level security;
alter table meals  enable row level security;
drop policy if exists "signed in" on orders;
drop policy if exists "signed in" on meals;
create policy "signed in" on orders for all to authenticated using (true) with check (true);
create policy "signed in" on meals  for all to authenticated using (true) with check (true);

-- ---- Added: itemised orders and website orders ----
alter table orders add column if not exists items jsonb not null default '[]';

-- Orders sent from the public website land here. Anyone can add one; only signed-in staff can read it.
create table if not exists web_orders (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  customer   text not null default '',
  notes      text not null default '',
  items      jsonb not null,
  total      int  not null default 0,
  status     text not null default 'New' check (status in ('New', 'Accepted', 'Dismissed'))
);
alter table web_orders enable row level security;
drop policy if exists "website can add" on web_orders;
drop policy if exists "staff manage" on web_orders;
create policy "website can add" on web_orders for insert to anon
  with check (status = 'New' and char_length(customer) <= 60 and char_length(notes) <= 300
              and jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30);
create policy "staff manage" on web_orders for all to authenticated using (true) with check (true);
grant insert on web_orders to anon;

-- ---- Added: admin panel (admin.html). Applied to the live project as migration "admin_panel". ----
create table if not exists admins (email text primary key);
-- Add the admin's email once in the SQL editor (kept out of this public repo):
--   insert into admins (email) values ('you@example.com') on conflict do nothing;
alter table admins enable row level security;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
drop policy if exists "read own admin row" on admins;
create policy "read own admin row" on admins for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create table if not exists expenses (
  id bigint generated always as identity primary key, expense_date date not null, vendor text not null default '',
  category text not null default 'Other', amount bigint not null default 0, vat bigint not null default 0,
  notes text not null default '', receipt_path text not null default '', created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on expenses (expense_date);
alter table expenses enable row level security;
drop policy if exists "admin only" on expenses;
create policy "admin only" on expenses for all to authenticated using (is_admin()) with check (is_admin());
create table if not exists settings (key text primary key, value text not null default '');
alter table settings enable row level security;
drop policy if exists "admin only" on settings;
create policy "admin only" on settings for all to authenticated using (is_admin()) with check (is_admin());
insert into settings (key, value) values ('vat_rate','3'), ('pit_rate','1.5'), ('exempt_threshold','500000000') on conflict do nothing;
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict do nothing;
drop policy if exists "admin receipts" on storage.objects;
create policy "admin receipts" on storage.objects for all to authenticated using (bucket_id = 'receipts' and is_admin()) with check (bucket_id = 'receipts' and is_admin());

-- ---- Added: live updates for the admin page ----
do $$
declare t text;
begin
  foreach t in array array['orders','meals','expenses'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---- Added: delivery details on website orders, and limits on what the public form can insert ----
alter table web_orders add column if not exists delivery_date date;
alter table web_orders add column if not exists phone   text not null default '';
alter table web_orders add column if not exists address text not null default '';

drop policy if exists "website can add" on web_orders;
create policy "website can add" on web_orders for insert to anon
  with check (status = 'New' and char_length(customer) <= 60 and char_length(notes) <= 300
              and char_length(phone) <= 20 and char_length(address) <= 250
              and jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30);

-- The total is always recomputed from the items, items must be sane, and at most 20 website orders are
-- accepted in any 10 minutes (stops a script flooding the staff screen; real orders still arrive by WhatsApp/Zalo).
create or replace function web_orders_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb; t numeric := 0; q numeric; p numeric;
begin
  if octet_length(new.items::text) > 20000 then raise exception 'order too large'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'bad item'; end if;
    if jsonb_typeof(it -> 'qty') is distinct from 'number' or jsonb_typeof(it -> 'price') is distinct from 'number' then raise exception 'bad item'; end if;
    q := (it ->> 'qty')::numeric; p := (it ->> 'price')::numeric;
    if q < 1 or q > 50 or p < 0 or p > 2000000 then raise exception 'bad item'; end if;
    t := t + q * p;
  end loop;
  new.total := round(t);
  if (select count(*) from web_orders where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too many orders, try again shortly';
  end if;
  return new;
end $$;
drop trigger if exists web_orders_guard on web_orders;
create trigger web_orders_guard before insert on web_orders for each row execute function web_orders_guard();
create index if not exists web_orders_created_idx on web_orders (created_at);

-- ---- Added: admin tables need the authenticator code (aal2) as well as the password ----
-- Run this ONLY after you have signed in at /admin and finished the authenticator setup, or you will lock yourself out of
-- the admin data (expenses, settings, receipts). Orders and the staff screen are unaffected.
-- If you ever lose the authenticator: in the SQL editor run
--   delete from auth.mfa_factors where user_id = (select id from auth.users where lower(email) = lower('your admin email'));
-- then sign in again and set up a new one.
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
