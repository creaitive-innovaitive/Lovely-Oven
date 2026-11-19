-- David's week: one 5-meal order (500k). Mon-Thu served, Fri left.
-- Undoes the split caused by paying today's meal with "Banked" (order 158 trimmed to 4, new 1-meal order 174).
begin;

update orders set qty = 5, pfood = 500000, paid = 500000 where id = 158 and oid = 'O19C65A156B';

update meals set oid = 'O19C65A156B', status = 'Served', note = '5 × Chicken meal'
where id = 'ME2E53614E5-1' and oid = 'OE2E53614E5';

insert into meals (id, meal_date, customer, status, oid, note)
values ('MFIXDAVID-104', '2026-11-20', 'David', 'Scheduled', 'O19C65A156B', '5 × Chicken meal');

delete from orders where id = 174 and oid = 'OE2E53614E5';

commit;

-- check: expect 5 meals on O19C65A156B (4 Served, 1 Scheduled), order 158 qty 5 paid 500000
select m.id, m.meal_date, m.status from meals m where m.oid = 'O19C65A156B' order by m.meal_date;
