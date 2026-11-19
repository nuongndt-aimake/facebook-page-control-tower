-- Configurable sales catalog, referral gifts, and staff-verified zero-value orders.
create table if not exists public.sales_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.sales_product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sales_products(id) on delete cascade,
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sales_product_prices_active_idx on public.sales_product_prices(product_id, effective_from desc);
create table if not exists public.sales_promo_codes (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  code_type text not null default 'promotion' check (code_type in ('promotion','student_referral')),
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value integer not null check (discount_value >= 0),
  gift_name text, gift_download_url text,
  starts_at timestamptz not null default now(), ends_at timestamptz, is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.sales_orders add column if not exists promo_code text, add column if not exists promo_discount_vnd bigint not null default 0, add column if not exists gift_name text, add column if not exists gift_download_url text, add column if not exists zero_value_verification_status text check (zero_value_verification_status in ('pending_staff_verification','verified','rejected')), add column if not exists zero_value_verified_by uuid references auth.users(id) on delete set null, add column if not exists zero_value_verified_at timestamptz;
insert into public.sales_product_prices(product_id,unit_price_vnd,effective_from)
select id,unit_price_vnd,now() from public.sales_products where not exists (select 1 from public.sales_product_prices p where p.product_id=sales_products.id);
insert into public.sales_settings(setting_key,setting_value) values ('profile_link_help_video', '{"url":""}'::jsonb) on conflict (setting_key) do nothing;
alter table public.sales_settings enable row level security; alter table public.sales_product_prices enable row level security; alter table public.sales_promo_codes enable row level security;
revoke all on public.sales_settings, public.sales_product_prices, public.sales_promo_codes from anon, authenticated;
