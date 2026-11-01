alter table public.profiles
  add column if not exists status text not null default 'active' check (status in ('active','suspended','deleted')),
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists admin_note text;
create index if not exists profiles_status_idx on public.profiles(status, role);

alter table public.page_access add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.page_access add column if not exists status text not null default 'active' check (status in ('active','suspended','ended'));
create index if not exists page_access_status_idx on public.page_access(user_id, status);

create table if not exists public.payment_profile_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_profile_id uuid not null references public.payment_profiles(id) on delete cascade,
  access_level text not null default 'viewer' check (access_level in ('viewer','manager')),
  status text not null default 'active' check (status in ('active','suspended','ended')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id, payment_profile_id)
);
alter table public.payment_profile_access enable row level security;
create index if not exists payment_profile_access_user_idx on public.payment_profile_access(user_id, status);
