-- Sales Platform Gate 1: canonical inventory and assignment-level reporting.
-- Additive only. Meta sync remains isolated; browser roles get no direct access.

create table if not exists public.sales_products (
  id uuid primary key default gen_random_uuid(), sku text unique, name text not null,
  product_type text not null default 'fanpage', description text, unit_price_vnd bigint,
  status text not null default 'draft', created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.sales_products add column if not exists product_group text not null default 'fanpage',
  add column if not exists sellable boolean not null default false,
  add column if not exists active_from timestamptz, add column if not exists active_until timestamptz;
alter table public.sales_products drop constraint if exists sales_products_product_group_check;
alter table public.sales_products add constraint sales_products_product_group_check check (product_group in ('fanpage', 'digital_skill', 'course', 'subscription'));
create index if not exists sales_products_group_status_idx on public.sales_products(product_group, status, sellable);

-- One physical Page = one item. Its row is the only source of stock truth.
create table if not exists public.sales_inventory_items (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.sales_products(id) on delete restrict,
  inventory_code text not null unique, inventory_type text not null default 'fanpage' check (inventory_type = 'fanpage'),
  status text not null default 'draft' check (status in ('draft', 'available', 'reserved', 'external_sold', 'inhouse_transferred', 'cancelled')),
  source_page_id text unique references public.pages(id) on delete restrict,
  purchase_cost_vnd bigint check (purchase_cost_vnd is null or purchase_cost_vnd >= 0),
  reserved_order_ref text, reserved_at timestamptz, sold_order_ref text, sold_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status <> 'reserved') or (reserved_order_ref is not null and reserved_at is not null)),
  check ((status <> 'external_sold') or (sold_order_ref is not null and sold_at is not null))
);
create index if not exists sales_inventory_items_availability_idx on public.sales_inventory_items(product_id, status, created_at);
create index if not exists sales_inventory_items_order_idx on public.sales_inventory_items(reserved_order_ref) where reserved_order_ref is not null;

create table if not exists public.fanpage_inventory_details (
  inventory_item_id uuid primary key references public.sales_inventory_items(id) on delete cascade,
  facebook_page_id text not null unique, page_link text not null, current_admin_reference text,
  current_bm_reference text, intake_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Inhouse transfer removes the same physical item from total stock.
create table if not exists public.inhouse_page_inventory (
  inventory_item_id uuid primary key references public.sales_inventory_items(id) on delete restrict,
  page_id text unique references public.pages(id) on delete restrict,
  status text not null default 'awaiting_assignment' check (status in ('awaiting_assignment', 'active', 'suspended', 'retired')),
  transferred_at timestamptz not null default now(), transferred_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz, retired_at timestamptz, note text
);
create index if not exists inhouse_page_inventory_status_idx on public.inhouse_page_inventory(status, transferred_at desc);

create table if not exists public.sales_inventory_ledger (
  id bigint generated always as identity primary key, inventory_item_id uuid not null references public.sales_inventory_items(id) on delete restrict,
  action text not null check (action in ('received', 'published', 'reserved', 'reservation_released', 'external_sold', 'inhouse_transferred', 'cancelled', 'corrected')),
  from_status text, to_status text not null, order_ref text, actor_user_id uuid references auth.users(id) on delete set null,
  reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists sales_inventory_ledger_item_idx on public.sales_inventory_ledger(inventory_item_id, created_at desc);
create index if not exists sales_inventory_ledger_order_idx on public.sales_inventory_ledger(order_ref, created_at desc) where order_ref is not null;

-- Each assignment reports independently, even when multiple people share a Page.
create table if not exists public.content_assignment_daily_reports (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.page_assignments(id) on delete restrict,
  page_id text not null references public.pages(id) on delete restrict, reporter_user_id uuid not null references auth.users(id) on delete restrict,
  report_date date not null, published_post_count integer not null default 0 check (published_post_count >= 0),
  revenue_vnd numeric(18,2) not null default 0 check (revenue_vnd >= 0), cumulative_revenue_vnd numeric(18,2) check (cumulative_revenue_vnd is null or cumulative_revenue_vnd >= 0),
  source_kind text not null default 'manual' check (source_kind in ('manual', 'google_sheet_import')), source_reference text,
  evidence jsonb not null default '{}'::jsonb, status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  submitted_at timestamptz not null default now(), verified_at timestamptz, verified_by uuid references auth.users(id) on delete set null,
  verification_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(assignment_id, report_date)
);
create index if not exists content_assignment_reports_person_idx on public.content_assignment_daily_reports(reporter_user_id, report_date desc);
create index if not exists content_assignment_reports_page_idx on public.content_assignment_daily_reports(page_id, report_date desc);
create index if not exists content_assignment_reports_status_idx on public.content_assignment_daily_reports(status, report_date desc);

-- Results point to an immutable policy version instead of being recomputed later.
create table if not exists public.commission_policy_versions (
  id uuid primary key default gen_random_uuid(), scope_type text not null check (scope_type in ('default', 'page', 'assignment')),
  page_id text references public.pages(id) on delete cascade, assignment_id uuid references public.page_assignments(id) on delete cascade,
  per_post_vnd bigint not null default 0 check (per_post_vnd >= 0), revenue_share_percent numeric(7,4) not null default 0 check (revenue_share_percent >= 0 and revenue_share_percent <= 100),
  effective_from date not null, effective_until date, status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references auth.users(id) on delete set null, approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((scope_type = 'default' and page_id is null and assignment_id is null) or (scope_type = 'page' and page_id is not null and assignment_id is null) or (scope_type = 'assignment' and assignment_id is not null))
);
create index if not exists commission_policy_versions_effective_idx on public.commission_policy_versions(status, effective_from, effective_until);

create table if not exists public.content_report_commission_results (
  id uuid primary key default gen_random_uuid(), report_id uuid not null unique references public.content_assignment_daily_reports(id) on delete restrict,
  policy_version_id uuid not null references public.commission_policy_versions(id) on delete restrict,
  post_amount_vnd bigint not null default 0 check (post_amount_vnd >= 0), revenue_amount_vnd bigint not null default 0 check (revenue_amount_vnd >= 0),
  total_amount_vnd bigint generated always as (post_amount_vnd + revenue_amount_vnd) stored,
  status text not null default 'calculated' check (status in ('calculated', 'approved', 'paid', 'void')),
  calculated_at timestamptz not null default now(), approved_at timestamptz, approved_by uuid references auth.users(id) on delete set null, paid_at timestamptz, note text
);
create index if not exists content_report_commission_results_status_idx on public.content_report_commission_results(status, calculated_at desc);

-- Metadata only; the future connector will be read-only against Google Sheets.
create table if not exists public.assignment_sheet_sources (
  assignment_id uuid primary key references public.page_assignments(id) on delete cascade, spreadsheet_id text not null,
  sheet_name text, range_a1 text, status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  last_import_at timestamptz, last_import_status text check (last_import_status in ('succeeded', 'failed')), last_error text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Lock first, mutate second. Browser roles cannot call these RPCs.
create or replace function public.sales_reserve_inventory_item(p_inventory_item_id uuid, p_order_ref text, p_actor_user_id uuid, p_reason text default null)
returns public.sales_inventory_items language plpgsql security definer set search_path = public as $$
declare item public.sales_inventory_items;
begin
  if coalesce(trim(p_order_ref), '') = '' then raise exception 'order_ref is required'; end if;
  select * into item from public.sales_inventory_items where id = p_inventory_item_id for update;
  if not found then raise exception 'inventory item not found'; end if;
  if item.status <> 'available' then raise exception 'inventory item is not available'; end if;
  update public.sales_inventory_items set status = 'reserved', reserved_order_ref = p_order_ref, reserved_at = now(), updated_at = now() where id = item.id returning * into item;
  insert into public.sales_inventory_ledger(inventory_item_id, action, from_status, to_status, order_ref, actor_user_id, reason) values (item.id, 'reserved', 'available', 'reserved', p_order_ref, p_actor_user_id, p_reason);
  return item;
end; $$;

create or replace function public.sales_release_inventory_reservation(p_inventory_item_id uuid, p_order_ref text, p_actor_user_id uuid, p_reason text default null)
returns public.sales_inventory_items language plpgsql security definer set search_path = public as $$
declare item public.sales_inventory_items;
begin
  select * into item from public.sales_inventory_items where id = p_inventory_item_id for update;
  if not found then raise exception 'inventory item not found'; end if;
  if item.status <> 'reserved' or item.reserved_order_ref is distinct from p_order_ref then raise exception 'reservation does not match'; end if;
  update public.sales_inventory_items set status = 'available', reserved_order_ref = null, reserved_at = null, updated_at = now() where id = item.id returning * into item;
  insert into public.sales_inventory_ledger(inventory_item_id, action, from_status, to_status, order_ref, actor_user_id, reason) values (item.id, 'reservation_released', 'reserved', 'available', p_order_ref, p_actor_user_id, p_reason);
  return item;
end; $$;

create or replace function public.sales_finalize_inventory_item(p_inventory_item_id uuid, p_order_ref text, p_destination text, p_actor_user_id uuid, p_page_id text default null, p_reason text default null)
returns public.sales_inventory_items language plpgsql security definer set search_path = public as $$
declare item public.sales_inventory_items;
begin
  if p_destination not in ('external_sold', 'inhouse_transferred') then raise exception 'invalid destination'; end if;
  select * into item from public.sales_inventory_items where id = p_inventory_item_id for update;
  if not found then raise exception 'inventory item not found'; end if;
  if item.status <> 'reserved' or item.reserved_order_ref is distinct from p_order_ref then raise exception 'reservation does not match'; end if;
  if p_destination = 'inhouse_transferred' and p_page_id is null then raise exception 'page_id is required for inhouse transfer'; end if;
  update public.sales_inventory_items set status = p_destination, sold_order_ref = p_order_ref, sold_at = now(), updated_at = now() where id = item.id returning * into item;
  if p_destination = 'inhouse_transferred' then insert into public.inhouse_page_inventory(inventory_item_id, page_id, transferred_by, note) values (item.id, p_page_id, p_actor_user_id, p_reason); end if;
  insert into public.sales_inventory_ledger(inventory_item_id, action, from_status, to_status, order_ref, actor_user_id, reason) values (item.id, p_destination, 'reserved', p_destination, p_order_ref, p_actor_user_id, p_reason);
  return item;
end; $$;

alter table public.sales_products enable row level security;
alter table public.sales_inventory_items enable row level security;
alter table public.fanpage_inventory_details enable row level security;
alter table public.inhouse_page_inventory enable row level security;
alter table public.sales_inventory_ledger enable row level security;
alter table public.content_assignment_daily_reports enable row level security;
alter table public.commission_policy_versions enable row level security;
alter table public.content_report_commission_results enable row level security;
alter table public.assignment_sheet_sources enable row level security;
revoke all on public.sales_products, public.sales_inventory_items, public.fanpage_inventory_details, public.inhouse_page_inventory, public.sales_inventory_ledger, public.content_assignment_daily_reports, public.commission_policy_versions, public.content_report_commission_results, public.assignment_sheet_sources from anon, authenticated;
revoke all on function public.sales_reserve_inventory_item(uuid, text, uuid, text), public.sales_release_inventory_reservation(uuid, text, uuid, text), public.sales_finalize_inventory_item(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sales_reserve_inventory_item(uuid, text, uuid, text), public.sales_release_inventory_reservation(uuid, text, uuid, text), public.sales_finalize_inventory_item(uuid, text, text, uuid, text, text) to service_role;

comment on table public.sales_inventory_items is 'Canonical physical stock for Fanpage sales. Browser roles have no direct access.';
comment on table public.inhouse_page_inventory is 'Operating inventory created only by a locked transfer from total sales inventory.';
comment on table public.content_assignment_daily_reports is 'One report per assignment per day; Page totals aggregate assignments, not replace them.';
