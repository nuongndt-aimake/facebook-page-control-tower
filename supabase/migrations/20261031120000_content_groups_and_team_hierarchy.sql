create table if not exists public.content_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  parent_group_id uuid references public.content_groups(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_user_id uuid references auth.users(id) on delete set null,
  group_id uuid references public.content_groups(id) on delete set null,
  role text not null default 'operator' check (role in ('platform_admin','manager','lead','operator','analyst','viewer')),
  status text not null default 'active' check (status in ('active','paused','ended')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  primary key(user_id, group_id)
);
create index if not exists team_memberships_parent_idx on public.team_memberships(parent_user_id, status);
create index if not exists team_memberships_group_idx on public.team_memberships(group_id, status);

create table if not exists public.page_group_assignments (
  page_id text not null references public.pages(id) on delete cascade,
  group_id uuid not null references public.content_groups(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','ended')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  primary key(page_id, group_id)
);
create index if not exists page_group_assignments_group_idx on public.page_group_assignments(group_id, status);

alter table public.page_assignments add column if not exists group_id uuid references public.content_groups(id) on delete set null;
alter table public.page_assignments add column if not exists parent_user_id uuid references auth.users(id) on delete set null;
alter table public.content_groups enable row level security;
alter table public.team_memberships enable row level security;
alter table public.page_group_assignments enable row level security;
