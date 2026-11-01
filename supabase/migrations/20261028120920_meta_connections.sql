create table public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  user_access_token text not null,
  business_ids jsonb not null default '[]'::jsonb,
  page_ids jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meta_connections_updated_idx on public.meta_connections(updated_at desc);
alter table public.meta_connections enable row level security;
