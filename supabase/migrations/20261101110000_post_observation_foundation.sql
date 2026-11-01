-- Post content provenance, metric observation history, and explicit refresh requests.
-- These tables are server-owned; no client grants/policies are added here.

create table if not exists public.post_sync_requests (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references public.posts(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  window_start date not null,
  window_end date not null,
  metric_names jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','succeeded','empty','failed','permission_error','not_available','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_metric_snapshots (
  id bigint generated always as identity primary key,
  post_id text not null references public.posts(id) on delete cascade,
  request_id uuid references public.post_sync_requests(id) on delete set null,
  observed_at timestamptz not null default now(),
  window_start date not null,
  window_end date not null,
  status text not null check (status in ('succeeded','empty','permission_error','not_available','failed')),
  comments_count bigint,
  reactions_count bigint,
  shares_count bigint,
  views_count bigint,
  reach_count bigint,
  engagement_count bigint,
  metrics_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists public.post_publications (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references public.posts(id) on delete cascade,
  page_id text references public.pages(id) on delete set null,
  destination_type text not null check (destination_type in ('page','community')),
  community_id text,
  community_name text,
  community_url text,
  published_at timestamptz,
  external_url text,
  discovered_source text not null check (discovered_source in ('meta','extension','manual')),
  discovered_by uuid references auth.users(id) on delete set null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','not_available','permission_error')),
  metadata jsonb not null default '{}'::jsonb,
  publication_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_sync_requests_post_idx on public.post_sync_requests(post_id, created_at desc);
create index if not exists post_sync_requests_ready_idx on public.post_sync_requests(status, available_at, created_at);
create index if not exists post_metric_snapshots_post_idx on public.post_metric_snapshots(post_id, observed_at desc);
create index if not exists post_metric_snapshots_window_idx on public.post_metric_snapshots(window_start, window_end, observed_at desc);
create index if not exists post_publications_post_idx on public.post_publications(post_id, published_at desc);
create index if not exists post_publications_destination_idx on public.post_publications(destination_type, community_id, published_at desc);

alter table public.post_sync_requests enable row level security;
alter table public.post_metric_snapshots enable row level security;
alter table public.post_publications enable row level security;
