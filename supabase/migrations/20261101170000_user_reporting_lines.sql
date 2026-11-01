-- Independent manager -> employee reporting lines.
-- This is deliberately separate from content groups: a person can report to a
-- manager without belonging to a content category/group.
create table if not exists public.user_reporting_lines (
  employee_user_id uuid primary key references auth.users(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','paused','ended')),
  effective_from date not null default current_date,
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (employee_user_id <> manager_user_id)
);
create index if not exists user_reporting_lines_manager_idx on public.user_reporting_lines(manager_user_id, status);
create index if not exists user_reporting_lines_status_idx on public.user_reporting_lines(status, updated_at desc);
alter table public.user_reporting_lines enable row level security;
