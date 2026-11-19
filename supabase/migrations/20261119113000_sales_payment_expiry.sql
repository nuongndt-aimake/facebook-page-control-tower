-- Payment expiry for public Fanpage checkout. Existing completed/test orders remain valid.
alter table public.sales_orders add column if not exists payment_expires_at timestamptz;
create index if not exists sales_orders_payment_expiry_idx on public.sales_orders(payment_status, payment_expires_at);
alter table public.sales_payment_events drop constraint if exists sales_payment_events_processing_status_check;
alter table public.sales_payment_events add constraint sales_payment_events_processing_status_check
  check (processing_status in ('processed','duplicate','amount_mismatch','unmatched','rejected','expired'));
