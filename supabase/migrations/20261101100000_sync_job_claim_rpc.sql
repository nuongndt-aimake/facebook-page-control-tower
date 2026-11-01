-- Atomic queue claim for the server-side dispatcher.
-- The function is intentionally not exposed to anon/authenticated clients.

create or replace function public.claim_sync_jobs(
  p_worker text,
  p_limit integer default 1
)
returns setof public.sync_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.sync_jobs
    where status = 'pending'
      and available_at <= now()
    order by created_at, id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 100)
  )
  update public.sync_jobs as job
  set status = 'running',
      attempt_count = job.attempt_count + 1,
      locked_at = now(),
      locked_by = p_worker,
      started_at = coalesce(job.started_at, now()),
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_sync_jobs(text, integer) from public;
revoke all on function public.claim_sync_jobs(text, integer) from anon;
revoke all on function public.claim_sync_jobs(text, integer) from authenticated;
grant execute on function public.claim_sync_jobs(text, integer) to service_role;
