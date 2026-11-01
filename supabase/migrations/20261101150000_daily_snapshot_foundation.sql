-- Daily reporting snapshots and inactive-by-default Vietnam time slots.

insert into public.sync_schedule_slots (slot_key, label, timezone, local_time, active, periods, max_concurrency)
values
  ('slot_06', 'Đồng bộ 06:00', 'Asia/Ho_Chi_Minh', '06:00', false, '["day","7d","28d"]'::jsonb, 1),
  ('slot_14', 'Đồng bộ 14:00', 'Asia/Ho_Chi_Minh', '14:00', false, '["day","7d","28d"]'::jsonb, 1),
  ('slot_22', 'Đồng bộ 22:00', 'Asia/Ho_Chi_Minh', '22:00', false, '["day","7d","28d"]'::jsonb, 1)
on conflict (slot_key) do nothing;

create table if not exists public.page_daily_snapshots (
  id bigint generated always as identity primary key,
  page_id text not null references public.pages(id) on delete cascade,
  snapshot_date date not null,
  window_start date not null,
  window_end date not null,
  sync_run_id bigint references public.sync_runs(id) on delete set null,
  status text not null check (status in ('ok','warning','empty','permission_error','not_available')),
  posts_count integer not null default 0,
  metrics_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique(page_id, snapshot_date)
);

create table if not exists public.post_daily_snapshots (
  id bigint generated always as identity primary key,
  post_id text not null references public.posts(id) on delete cascade,
  page_id text references public.pages(id) on delete set null,
  snapshot_date date not null,
  window_start date not null,
  window_end date not null,
  status text not null check (status in ('ok','empty','permission_error','not_available')),
  comments_count bigint,
  reactions_count bigint,
  shares_count bigint,
  metrics_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique(post_id, snapshot_date)
);

create table if not exists public.revenue_daily_snapshots (
  id bigint generated always as identity primary key,
  page_id text not null references public.pages(id) on delete cascade,
  snapshot_date date not null,
  amount numeric(18,6),
  currency text not null default 'USD',
  source text not null check (source in ('graph_api','manual','reconciled','not_available')),
  raw_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique(page_id, snapshot_date, currency, source)
);

create index if not exists page_daily_snapshots_date_idx on public.page_daily_snapshots(snapshot_date desc, page_id);
create index if not exists post_daily_snapshots_date_idx on public.post_daily_snapshots(snapshot_date desc, page_id);
create index if not exists revenue_daily_snapshots_date_idx on public.revenue_daily_snapshots(snapshot_date desc, page_id);
alter table public.page_daily_snapshots enable row level security;
alter table public.post_daily_snapshots enable row level security;
alter table public.revenue_daily_snapshots enable row level security;
