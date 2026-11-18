-- Fanpage Sales line: products, orders, payment reconciliation and staff handover.
-- Impact: isolated sales domain; no changes to Page/Payout ownership tables.
create table if not exists public.sales_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  product_type text not null default 'fanpage',
  description text,
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique check (order_code ~ '^FS[A-Z0-9]{10}$'),
  product_id uuid not null references public.sales_products(id),
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_email text not null,
  fulfillment_profile_url text,
  quantity integer not null check (quantity > 0),
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  expected_amount_vnd bigint not null check (expected_amount_vnd > 0),
  payment_reference text not null unique,
  payment_status text not null default 'pending_payment' check (payment_status in ('pending_payment','paid','reconciliation_required','expired','cancelled','refunded')),
  fulfillment_status text not null default 'unassigned' check (fulfillment_status in ('unassigned','assigned','in_progress','completed','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sales_order_assignments (
  order_id uuid primary key references public.sales_orders(id) on delete cascade,
  assignee_user_id uuid not null references auth.users(id),
  manager_user_id uuid references auth.users(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  handover_note text
);
create table if not exists public.sales_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  order_id uuid references public.sales_orders(id) on delete set null,
  amount_vnd bigint,
  processing_status text not null check (processing_status in ('processed','duplicate','amount_mismatch','unmatched','rejected')),
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists sales_orders_buyer_idx on public.sales_orders(buyer_user_id, created_at desc);
create index if not exists sales_orders_payment_idx on public.sales_orders(payment_status, created_at desc);
create index if not exists sales_assignments_assignee_idx on public.sales_order_assignments(assignee_user_id);
alter table public.sales_products enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_assignments enable row level security;
alter table public.sales_payment_events enable row level security;
revoke all on public.sales_products, public.sales_orders, public.sales_order_assignments, public.sales_payment_events from anon, authenticated;
-- Seed only the current active sale line. Other products can be added as draft then activated by Admin.
insert into public.sales_products (sku,name,product_type,description,unit_price_vnd,status)
values ('FANPAGE','Fanpage','fanpage','Fanpage giao nhận qua line bán hàng',1500000,'active')
on conflict (sku) do nothing;