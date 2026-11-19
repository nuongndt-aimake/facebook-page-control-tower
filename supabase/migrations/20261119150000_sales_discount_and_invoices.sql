-- Fanpage Sales line: server-side quantity discount and invoice intake.
-- Impact: additive only. Existing orders retain their original expected amount.

alter table public.profiles add column if not exists phone text;

alter table public.sales_orders
  add column if not exists gross_amount_vnd bigint,
  add column if not exists discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  add column if not exists discount_amount_vnd bigint not null default 0 check (discount_amount_vnd >= 0);

update public.sales_orders
set gross_amount_vnd = expected_amount_vnd
where gross_amount_vnd is null;

alter table public.sales_orders alter column gross_amount_vnd set not null;
alter table public.sales_orders add constraint sales_orders_gross_amount_positive check (gross_amount_vnd > 0);

create table if not exists public.sales_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  product_type text not null,
  min_quantity integer not null check (min_quantity > 0),
  discount_percent integer not null check (discount_percent between 0 and 100),
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_type, min_quantity)
);

create index if not exists sales_discount_tiers_lookup_idx
  on public.sales_discount_tiers(product_type, is_active, min_quantity desc);

-- Initial commercial policy, stored as data so it can be amended without
-- recalculating the price fixed on existing orders.
insert into public.sales_discount_tiers (product_type, min_quantity, discount_percent, is_active)
values
  ('fanpage', 1, 0, true),
  ('fanpage', 2, 5, true),
  ('fanpage', 5, 10, true),
  ('fanpage', 10, 15, true)
on conflict (product_type, min_quantity) do nothing;

create table if not exists public.sales_invoice_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.sales_orders(id) on delete cascade,
  invoice_type text not null check (invoice_type in ('individual', 'daily_aggregate')),
  invoice_status text not null default 'pending_payment' check (invoice_status in ('pending_payment', 'ready_to_issue', 'issued', 'aggregate_pending', 'aggregated', 'cancelled')),
  customer_name text,
  tax_code text,
  billing_address text,
  billing_email text,
  aggregation_date date not null,
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  issued_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (invoice_type = 'individual' and customer_name is not null and tax_code is not null and billing_address is not null and billing_email is not null)
    or invoice_type = 'daily_aggregate'
  )
);

create index if not exists sales_invoice_records_aggregate_idx
  on public.sales_invoice_records(invoice_type, invoice_status, aggregation_date);

alter table public.sales_discount_tiers enable row level security;
alter table public.sales_invoice_records enable row level security;
revoke all on public.sales_discount_tiers, public.sales_invoice_records from anon, authenticated;
