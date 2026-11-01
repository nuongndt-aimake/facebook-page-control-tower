alter table public.payment_profiles
  add column if not exists profile_name text,
  add column if not exists recipient_type text not null default 'person' check (recipient_type in ('person','company','bank_account','external')),
  add column if not exists recipient_name text,
  add column if not exists recipient_account text,
  add column if not exists receiving_account_name text,
  add column if not exists receiving_account_id text,
  add column if not exists managed_by_facebook_user_id text,
  add column if not exists managed_by_connection_id uuid references public.meta_connections(id),
  add column if not exists status text not null default 'active' check (status in ('active','paused','closed','unknown')),
  add column if not exists note text;
create index if not exists payment_profiles_status_idx on public.payment_profiles(status, recipient_name);
create index if not exists payment_profiles_manager_idx on public.payment_profiles(managed_by_facebook_user_id, managed_by_connection_id);

create table if not exists public.payment_profile_managers (
  payment_profile_id uuid not null references public.payment_profiles(id) on delete cascade,
  facebook_user_id text,
  connection_id uuid references public.meta_connections(id) on delete set null,
  manager_name text,
  role text not null default 'operator' check (role in ('owner','finance','operator','viewer')),
  status text not null default 'active' check (status in ('active','ended')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(payment_profile_id, facebook_user_id, connection_id)
);
create index if not exists payment_profile_managers_fb_idx on public.payment_profile_managers(facebook_user_id, status);
alter table public.payment_profile_managers enable row level security;
