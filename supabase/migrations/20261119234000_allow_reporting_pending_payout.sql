-- CLI-generated 20261119155159; ordered after report/profile dependencies.
create or replace function public.content_report_command(p_action text,p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype;assignment public.page_assignments%rowtype;report public.content_assignment_daily_reports%rowtype;previous jsonb;
 d date;posts integer;revenue numeric;cumulative numeric;note text;is_all boolean;unit text;payout_id uuid;
begin
 select * into actor from public.profiles where id=p_actor;if not found or actor.status is distinct from 'active' then raise exception 'Forbidden';end if;
 if p_action='submit' then
  select * into assignment from public.page_assignments where id=(p_input->>'assignment_id')::uuid for update;
  if not found or assignment.user_id is distinct from p_actor or assignment.status<>'active' then raise exception 'Forbidden';end if;
  if not exists(select 1 from public.inhouse_page_inventory h join public.sales_inventory_items i on i.id=h.inventory_item_id where h.page_id=assignment.page_id and h.status='active' and i.status='inhouse_transferred') then raise exception 'Page is not active Inhouse';end if;
  d:=(p_input->>'report_date')::date;
  if d is null or d>(now() at time zone 'Asia/Ho_Chi_Minh')::date or d<(assignment.assigned_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Invalid report date';end if;
  unit:=coalesce(nullif(p_input->>'currency',''),'VND');if unit not in ('USD','VND') then raise exception 'Invalid report currency';end if;
  posts:=(p_input->>'published_post_count')::integer;
  revenue:=case when unit='USD' then (p_input->>'revenue_amount')::numeric else coalesce(p_input->>'revenue_amount',p_input->>'revenue_vnd')::numeric end;
  cumulative:=case when unit='USD' then (p_input->>'cumulative_amount')::numeric else coalesce(p_input->>'cumulative_amount',p_input->>'cumulative_revenue_vnd')::numeric end;
  if posts is null or posts<0 or revenue is null or revenue<0 or cumulative is null or cumulative<0 or revenue::text in ('NaN','Infinity','-Infinity') or cumulative::text in ('NaN','Infinity','-Infinity') or revenue<>round(revenue,2) or cumulative<>round(cumulative,2) then raise exception 'Invalid report numbers';end if;
  if nullif(p_input->>'source_reference','') is not null and p_input->>'source_reference'!~'^https://' then raise exception 'Invalid evidence URL';end if;
  perform pg_advisory_xact_lock(hashtextextended(assignment.id::text||':'||d::text,0));
  select * into report from public.content_assignment_daily_reports where assignment_id=assignment.id and report_date=d for update;
  previous:=case when found then to_jsonb(report) else null end;
  if report.status='verified' then raise exception 'Verified report is locked';end if;
  if report.id is not null and report.currency<>unit then raise exception 'Invalid report currency change';end if;
  perform pg_advisory_xact_lock(hashtextextended('page-payout:'||assignment.page_id,0));
  payout_id:=report.payment_profile_id;
  if payout_id is null then
   select p.payment_profile_id into payout_id from public.page_payout_assignments p join public.payment_profiles f on f.id=p.payment_profile_id where p.page_id=assignment.page_id and f.currency=unit and f.status='active';
  end if;
  insert into public.content_assignment_daily_reports(assignment_id,page_id,reporter_user_id,report_date,published_post_count,revenue_vnd,cumulative_revenue_vnd,currency,revenue_amount,cumulative_amount,payment_profile_id,source_kind,source_reference,evidence)
  values(assignment.id,assignment.page_id,p_actor,d,posts,case when unit='VND' then revenue else 0 end,case when unit='VND' then cumulative else 0 end,unit,revenue,cumulative,payout_id,'manual',nullif(p_input->>'source_reference',''),jsonb_build_object('note',left(p_input->>'note',4000)))
  on conflict(assignment_id,report_date) do update set published_post_count=excluded.published_post_count,revenue_vnd=excluded.revenue_vnd,cumulative_revenue_vnd=excluded.cumulative_revenue_vnd,currency=excluded.currency,revenue_amount=excluded.revenue_amount,cumulative_amount=excluded.cumulative_amount,payment_profile_id=excluded.payment_profile_id,source_reference=excluded.source_reference,evidence=excluded.evidence,status='submitted',submitted_at=now(),verified_at=null,verified_by=null,verification_note=null,updated_at=now() returning * into report;
 elsif p_action in ('verify','reject') then
  if not public.operations_allowed(p_actor,'sales_operations','verify_reports') then raise exception 'Forbidden';end if;
  select * into report from public.content_assignment_daily_reports where id=(p_input->>'report_id')::uuid for update;
  if not found then raise exception 'Invalid report';end if;
  is_all:=actor.role in ('platform_admin','super_admin');
  if not is_all and actor.role<>'manager' then raise exception 'Forbidden';end if;
  if report.reporter_user_id=p_actor or (not is_all and report.reporter_user_id not in(select public.operations_visible_users(p_actor))) then raise exception 'Forbidden';end if;
  if report.status=(case when p_action='verify' then 'verified' else 'rejected' end) then return jsonb_build_object('ok',true,'duplicate',true);end if;
  if report.status='verified' then raise exception 'Verified report is locked';end if;
  note:=btrim(p_input->>'note');if p_action='reject' and coalesce(note,'')='' then raise exception 'Invalid rejection reason';end if;
  previous:=to_jsonb(report);
  update public.content_assignment_daily_reports set status=case when p_action='verify' then 'verified' else 'rejected' end,verified_at=now(),verified_by=p_actor,verification_note=note,updated_at=now() where id=report.id returning * into report;
 else raise exception 'Invalid report action';end if;
 insert into public.content_report_revisions(report_id,actor_user_id,action,previous_data,new_data) values(report.id,p_actor,p_action,previous,to_jsonb(report));
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'content_report_'||p_action,'content_report',report.id,jsonb_build_object('assignment_id',report.assignment_id,'report_date',report.report_date,'currency',report.currency,'payment_profile_id',report.payment_profile_id));
 return jsonb_build_object('ok',true,'report',to_jsonb(report),'payout_pending',report.payment_profile_id is null);
end $$;
revoke all on function public.content_report_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.content_report_command(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
