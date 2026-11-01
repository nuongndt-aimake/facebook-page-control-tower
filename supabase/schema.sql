-- Run once in Supabase SQL Editor. Server writes use the service-role key only.
create table if not exists public.pages (
  id text primary key, name text not null, category text, tasks jsonb not null default '[]'::jsonb,
  meta_connection text not null, updated_at timestamptz not null
);
create table if not exists public.posts (
  id text primary key, page_id text not null references public.pages(id) on delete cascade,
  created_time timestamptz, message text, permalink_url text, media_type text,
  raw_json jsonb not null, synced_at timestamptz not null
);
create table if not exists public.metrics (
  entity_type text not null check (entity_type in ('page','post')), entity_id text not null,
  metric text not null, period text not null, end_time text not null, value_json jsonb not null,
  synced_at timestamptz not null, primary key(entity_type, entity_id, metric, period, end_time)
);
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key, ran_at timestamptz not null,
  since_date date not null, until_date date not null, status text not null,
  summary jsonb not null
);

-- Operations: a Page can be operated for revenue sharing or sold outright.
alter table public.pages add column if not exists custody_status text not null default 'intake'
  check (custody_status in ('intake','ready','operating','collaborating','reserved','onboarding','handover_ready','handed_over','blocked'));
alter table public.pages add column if not exists custodian_business_id text;
alter table public.pages add column if not exists acquisition_note text;
alter table public.pages add column if not exists internal_note text;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(), page_id text not null references public.pages(id),
  deal_type text not null check (deal_type in ('revenue_share','outright_sale')),
  status text not null default 'listed' check (status in ('draft','listed','reserved','onboarding','active','handover_ready','completed','cancelled')),
  title text not null, asking_price numeric(14,2), currency text not null default 'VND',
  revenue_share_percent numeric(5,2), terms_note text, customer_name text, customer_email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((deal_type = 'revenue_share' and revenue_share_percent is not null) or deal_type = 'outright_sale')
);
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals(id) on delete cascade,
  applicant_name text not null, applicant_email text not null, requested_task text not null default 'ANALYZE',
  status text not null default 'submitted' check (status in ('submitted','approved','bm_invited','accepted','task_granted','rejected','cancelled')),
  meta_business_user_id text, submitted_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(), page_id text not null references public.pages(id), deal_id uuid references public.deals(id),
  period_start date not null, period_end date not null, gross_amount numeric(14,2) not null,
  currency text not null default 'VND', source text not null default 'manual_business_suite', note text,
  created_at timestamptz not null default now()
);
create table if not exists public.handover_audit (
  id bigint generated always as identity primary key, page_id text not null references public.pages(id),
  deal_id uuid references public.deals(id), action text not null, actor text not null,
  detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists deals_page_idx on public.deals(page_id, created_at desc);
create index if not exists access_requests_deal_idx on public.access_requests(deal_id, submitted_at desc);
create index if not exists revenue_entries_page_idx on public.revenue_entries(page_id, period_end desc);
create index if not exists posts_page_created_idx on public.posts(page_id, created_time desc);
create index if not exists metrics_entity_idx on public.metrics(entity_type, entity_id, end_time desc);
alter table public.pages enable row level security;
alter table public.posts enable row level security;
alter table public.metrics enable row level security;
alter table public.sync_runs enable row level security;
alter table public.deals enable row level security;
alter table public.access_requests enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.handover_audit enable row level security;
