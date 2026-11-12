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
insert into admins (email) values ('gbyatt@gmail.com') on conflict do nothing;
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
