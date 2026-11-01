alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('viewer','analyst','operator','manager','platform_admin','super_admin'));
alter table public.profiles add column if not exists role_level integer not null default 10;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
create index if not exists profiles_role_level_idx on public.profiles(role_level, status);

create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.content_groups add column if not exists category_id uuid references public.content_categories(id) on delete set null;
create index if not exists content_groups_category_idx on public.content_groups(category_id, status);

alter table public.revenue_entries add column if not exists payment_profile_id uuid references public.payment_profiles(id) on delete set null;
create index if not exists revenue_entries_payment_profile_idx on public.revenue_entries(payment_profile_id, period_end desc);

create table if not exists public.page_commissions (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_percent numeric(5,2) not null check (share_percent >= 0 and share_percent <= 100),
  effective_from date not null default current_date,
  effective_until date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists page_commissions_page_idx on public.page_commissions(page_id, status, effective_from);
create index if not exists page_commissions_user_idx on public.page_commissions(user_id, status);
alter table public.page_commissions enable row level security;
