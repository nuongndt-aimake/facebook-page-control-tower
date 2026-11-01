-- Reporting snapshots, BM registry, and explicit managed scope.
alter table public.pages add column if not exists asset_scope text not null default 'personal'
  check (asset_scope in ('bm','personal','configured'));
alter table public.pages add column if not exists custodian_business_name text;
alter table public.pages add column if not exists managed_by_connection text;
alter table public.pages add column if not exists last_synced_at timestamptz;

create table if not exists public.businesses (
  id text primary key,
  name text not null,
  meta_connection text not null,
  managed boolean not null default true,
  last_synced_at timestamptz not null
);
alter table public.businesses enable row level security;
create index if not exists pages_asset_scope_idx on public.pages(asset_scope, custodian_business_id);
create index if not exists pages_business_idx on public.pages(custodian_business_id, name);
create index if not exists sync_runs_window_idx on public.sync_runs(until_date desc, ran_at desc);
