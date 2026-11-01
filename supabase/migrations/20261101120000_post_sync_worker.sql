-- Claim and attempt audit for explicit post metric refresh requests.

create table if not exists public.post_sync_attempts (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.post_sync_requests(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('started','succeeded','empty','failed','permission_error','not_available')),
  error_message text,
  rows_written integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(request_id, attempt_no)
);

create index if not exists post_sync_attempts_request_idx on public.post_sync_attempts(request_id, attempt_no desc);
alter table public.post_sync_attempts enable row level security;

create or replace function public.claim_post_sync_requests(
  p_worker text,
  p_limit integer default 1
)
returns setof public.post_sync_requests
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.post_sync_requests
    where status = 'pending'
      and available_at <= now()
    order by created_at, id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 100)
  )
  update public.post_sync_requests as request
  set status = 'running',
      attempt_count = request.attempt_count + 1,
      started_at = coalesce(request.started_at, now()),
      updated_at = now()
  from candidates
  where request.id = candidates.id
  returning request.*;
end;
$$;

revoke all on function public.claim_post_sync_requests(text, integer) from public;
revoke all on function public.claim_post_sync_requests(text, integer) from anon;
revoke all on function public.claim_post_sync_requests(text, integer) from authenticated;
grant execute on function public.claim_post_sync_requests(text, integer) to service_role;
