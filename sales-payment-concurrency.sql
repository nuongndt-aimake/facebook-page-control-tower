-- QA only: explicitly cancelled fulfillment, never fulfill these synthetic rows.
insert into public.sales_orders(order_code,product_id,buyer_name,buyer_phone,buyer_email,quantity,unit_price_vnd,gross_amount_vnd,expected_amount_vnd,payment_reference,payment_expires_at,fulfillment_status)
select code,p.id,'QA CONCURRENCY DO NOT FULFILL','0000000000','qa-race@example.com',1,10000,10000,10000,code,now()+interval '1 hour','cancelled'
from public.sales_products p cross join (values('FSQA19110001'),('FSQA19110002')) fixtures(code)
where p.sku='FANPAGE' on conflict(order_code) do nothing;
insert into public.sales_invoice_records(order_id,invoice_type,invoice_status,aggregation_date)
select id,'daily_aggregate','pending_payment',current_date from public.sales_orders where order_code in ('FSQA19110001','FSQA19110002') on conflict(order_id) do nothing;

-- Separate DB session A: hold the event/order lock so B overlaps.
-- begin; select public.sales_process_payment_event('qa-race-1911-same','FSQA19110001',10000,'in','{"qa":true}'::jsonb); select pg_sleep(8); commit;
-- Session B: same event, returns duplicate after A commits.
-- select public.sales_process_payment_event('qa-race-1911-same','FSQA19110001',10000,'in','{"qa":true}'::jsonb);
-- Repeat using different event IDs for one order:
-- A: begin; select public.sales_process_payment_event('qa-race-1911-first','FSQA19110002',10000,'in','{"qa":true}'); select pg_sleep(8); commit;
-- B: select public.sales_process_payment_event('qa-race-1911-second','FSQA19110002',10000,'in','{"qa":true}');

-- Verification: same event => 1 row/1 processed; different IDs => 2 rows/1 processed/1 duplicate.
select o.order_code,o.payment_status,count(e.id) as event_count,count(*) filter(where e.processing_status='processed') as processed_count,count(*) filter(where e.processing_status='duplicate') as duplicate_count
from public.sales_orders o left join public.sales_payment_events e on e.order_id=o.id
where o.order_code in ('FSQA19110001','FSQA19110002') group by o.order_code,o.payment_status;

-- Run after verification (keep audit history, never delete events).
-- update public.sales_orders set payment_status='cancelled',updated_at=now() where order_code in ('FSQA19110001','FSQA19110002');
-- update public.sales_invoice_records set invoice_status='cancelled',updated_at=now() where order_id in (select id from public.sales_orders where order_code in ('FSQA19110001','FSQA19110002'));
