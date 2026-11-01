create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer','manager','platform_admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.page_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null references public.pages(id) on delete cascade,
  access_level text not null default 'viewer' check (access_level in ('viewer','manager')),
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
alter table public.profiles enable row level security;
alter table public.page_access enable row level security;
grant select on public.profiles, public.page_access to authenticated;
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists page_access_self_select on public.page_access;
create policy page_access_self_select on public.page_access for select to authenticated using ((select auth.uid()) = user_id);
create index if not exists page_access_page_idx on public.page_access(page_id);
