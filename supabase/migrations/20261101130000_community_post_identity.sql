-- Allow community-only post identities when no managed Page owns the post.
alter table public.posts alter column page_id drop not null;
alter table public.posts add column if not exists origin_type text not null default 'page'
  check (origin_type in ('page','community'));
alter table public.posts add column if not exists source_group_id text;
alter table public.posts add column if not exists source_group_name text;
alter table public.posts add column if not exists external_url text;
alter table public.posts add column if not exists ingested_source text not null default 'meta'
  check (ingested_source in ('meta','extension','manual'));
alter table public.posts add column if not exists discovered_by uuid references auth.users(id) on delete set null;
create index if not exists posts_origin_type_idx on public.posts(origin_type, created_time desc);
create index if not exists posts_source_group_idx on public.posts(source_group_id, created_time desc);
