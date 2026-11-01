-- Stable asset identity, connection history, assignments, and payment-profile registry.
-- Meta Page IDs remain the external key; registry_id is our immutable lifetime ID.
alter table public.pages
  add column if not exists registry_id uuid default gen_random_uuid(),
  add column if not exists first_connected_at timestamptz,
  add column if not exists first_connection_id uuid references public.meta_connections(id),
  add column if not exists current_status text not null default 'active',
  add column if not exists topic text,
  add column if not exists group_name text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.pages
set registry_id = gen_random_uuid()
where registry_id is null;

alter table public.pages alter column registry_id set not null;
create unique index if not exists pages_registry_id_uidx on public.pages(registry_id);
create index if not exists pages_status_idx on public.pages(current_status, group_name, topic);

create table if not exists public.page_connection_history (
  id bigint generated always as identity primary key,
  page_id text not null references public.pages(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  business_id text,
  source text not null default 'unknown' check (source in ('bm','personal','configured','unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_token_valid_at timestamptz,
  status text not null default 'active' check (status in ('active','stale','revoked','removed')),
  raw_json jsonb not null default '{}'::jsonb,
  unique(page_id, connection_id, business_id)
);
create index if not exists page_connection_history_page_idx on public.page_connection_history(page_id, last_seen_at desc);
create index if not exists page_connection_history_connection_idx on public.page_connection_history(connection_id, status);

create table if not exists public.page_assignments (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.pages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  group_name text,
  topic text,
  assignment_role text not null default 'operator' check (assignment_role in ('owner','manager','operator','analyst','viewer')),
  status text not null default 'active' check (status in ('active','paused','ended')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  note text
);
create index if not exists page_assignments_page_idx on public.page_assignments(page_id, status);
create index if not exists page_assignments_user_idx on public.page_assignments(user_id, status);

create table if not exists public.payment_profiles (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  business_id text,
  account_name text,
  payout_status text,
  currency text,
  country text,
  source text not null default 'meta',
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.page_payment_profiles (
  page_id text not null references public.pages(id) on delete cascade,
  payment_profile_id uuid not null references public.payment_profiles(id) on delete cascade,
  relation_type text not null default 'associated',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(page_id, payment_profile_id)
);
create index if not exists payment_profiles_business_idx on public.payment_profiles(business_id, payout_status);

alter table public.page_connection_history enable row level security;
alter table public.page_assignments enable row level security;
alter table public.payment_profiles enable row level security;
alter table public.page_payment_profiles enable row level security;
