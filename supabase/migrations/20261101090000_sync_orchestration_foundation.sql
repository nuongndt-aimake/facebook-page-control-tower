-- P0 foundation for scheduled sync orchestration.
-- This migration creates the control plane only; the worker remains backward-compatible
-- until the queue dispatcher is enabled behind a feature flag.

create table if not exists public.sync_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  label text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  local_time time not null,
  active boolean not null default false,
  periods jsonb not null default '["day"]'::jsonb,
  max_concurrency integer not null default 1 check (max_concurrency > 0 and max_concurrency <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  sync_run_id bigint references public.sync_runs(id) on delete set null,
  connection_id uuid references public.meta_connections(id) on delete set null,
  page_id text references public.pages(id) on delete cascade,
  slot_key text references public.sync_schedule_slots(slot_key) on delete set null,
  job_type text not null default 'page_sync' check (job_type in ('asset_refresh','page_sync','post_sync','metric_sync','snapshot')),
  period text not null,
  since_date date not null,
  until_date date not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','dead_letter','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.sync_jobs(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('started','succeeded','empty','failed')),
  endpoint text,
  request_kind text,
  response_code integer,
  error_code text,
  error_message text,
  rows_written integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(job_id, attempt_no)
);

create table if not exists public.sync_locks (
  lock_key text primary key,
  owner text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_jobs_ready_idx on public.sync_jobs(status, available_at, created_at);
create index if not exists sync_jobs_page_idx on public.sync_jobs(page_id, status, created_at desc);
create index if not exists sync_jobs_run_idx on public.sync_jobs(sync_run_id, status);
create index if not exists sync_attempts_job_idx on public.sync_attempts(job_id, attempt_no desc);
create index if not exists admin_audit_logs_target_idx on public.admin_audit_logs(target_type, target_id, created_at desc);
create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_user_id, created_at desc);

alter table public.sync_schedule_slots enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_attempts enable row level security;
alter table public.sync_locks enable row level security;
alter table public.admin_audit_logs enable row level security;

-- No direct client grants/policies are added. Server-side API access uses the
-- service role and must still enforce accessContext/requireAdmin before writes.
