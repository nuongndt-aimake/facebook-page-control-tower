-- Generated with `supabase migration new authorization_branch_fulfillment_foundation`.
-- Impact: adds product-branch and auditable authorization-grant foundations only.
-- Does not replace legacy permissions JSON, enable client table access, or change fulfillment state transitions.

begin;

create table if not exists public.product_branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,64}$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active','paused','archived')),
  manager_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_branches enable row level security;
revoke all on public.product_branches from anon, authenticated;

insert into public.product_branches(code,name,status)
values ('FANPAGE_LEGACY','Fanpage kế thừa','active')
on conflict(code) do nothing;

alter table public.sales_products add column if not exists product_branch_id uuid references public.product_branches(id) on delete restrict;
alter table public.sales_inventory_items add column if not exists product_branch_id uuid references public.product_branches(id) on delete restrict;
alter table public.sales_orders add column if not exists product_branch_id uuid references public.product_branches(id) on delete restrict;

update public.sales_products p
set product_branch_id = b.id
from public.product_branches b
where b.code = 'FANPAGE_LEGACY'
  and p.product_group = 'fanpage'
  and p.product_branch_id is null;

update public.sales_inventory_items i
set product_branch_id = p.product_branch_id
from public.sales_products p
where p.id = i.product_id
  and i.product_branch_id is null;

update public.sales_orders o
set product_branch_id = p.product_branch_id
from public.sales_products p
where p.id = o.product_id
  and o.product_branch_id is null;

alter table public.sales_products drop constraint if exists sales_products_fanpage_branch_required;
alter table public.sales_products add constraint sales_products_fanpage_branch_required
  check (product_group <> 'fanpage' or product_branch_id is not null);

create index if not exists sales_products_branch_status_idx on public.sales_products(product_branch_id,status,product_group);
create index if not exists sales_inventory_items_branch_status_idx on public.sales_inventory_items(product_branch_id,status,created_at);
create index if not exists sales_orders_branch_fulfillment_idx on public.sales_orders(product_branch_id,fulfillment_status,created_at desc);

create table if not exists public.authorization_grants (
  id uuid primary key default gen_random_uuid(),
  principal_user_id uuid not null references auth.users(id) on delete restrict,
  capability_family text not null check (capability_family in ('identity','organization','catalog','sales_orders','sales_inventory','sales_operations','integrations','finance','audit')),
  capability_action text not null check (length(btrim(capability_action)) between 2 and 96),
  scope_type text not null check (scope_type in ('branch','page','order','inhouse_assets','all')),
  scope_ref text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  grant_reason text not null check (length(btrim(grant_reason)) between 3 and 500),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type = 'all' and scope_ref is null) or (scope_type <> 'all' and nullif(btrim(scope_ref),'') is not null)),
  check (valid_until is null or valid_until > valid_from),
  check ((revoked_at is null and revoked_by is null and revoke_reason is null) or (revoked_at is not null and nullif(btrim(revoke_reason),'') is not null))
);

create index if not exists authorization_grants_active_scope_idx
  on public.authorization_grants(principal_user_id,capability_family,capability_action,scope_type,coalesce(scope_ref,''),valid_from)
  where revoked_at is null;
create index if not exists authorization_grants_effective_idx
  on public.authorization_grants(principal_user_id,capability_family,capability_action,valid_from,valid_until)
  where revoked_at is null;

alter table public.authorization_grants enable row level security;
revoke all on public.authorization_grants from anon, authenticated;

comment on table public.product_branches is 'Branch scope for product, total inventory and order snapshots. Legacy Fanpage data starts in FANPAGE_LEGACY until explicitly reorganized.';
comment on table public.authorization_grants is 'Auditable capability and scope grants. Legacy profiles.permissions stays effective during transition; no client access.';

notify pgrst, 'reload schema';
commit;
