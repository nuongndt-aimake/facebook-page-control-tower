-- CLI-generated 20261119144436; ordered after inventory/report dependencies.
alter table public.content_assignment_daily_reports add column currency text not null default 'VND' check(currency in ('USD','VND'));
alter table public.content_assignment_daily_reports add column revenue_amount numeric(18,2) check(revenue_amount>=0);
alter table public.content_assignment_daily_reports add column cumulative_amount numeric(18,2) check(cumulative_amount>=0);
alter table public.content_assignment_daily_reports add column payment_profile_id uuid references public.payment_profiles(id) on delete restrict;
update public.content_assignment_daily_reports set revenue_amount=revenue_vnd,cumulative_amount=cumulative_revenue_vnd;
create table public.page_payout_assignments(
 page_id text primary key references public.pages(id) on delete restrict,
 payment_profile_id uuid not null references public.payment_profiles(id) on delete restrict,
 assigned_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create index page_payout_assignments_profile_idx on public.page_payout_assignments(payment_profile_id);
create index content_reports_payout_idx on public.content_assignment_daily_reports(payment_profile_id) where payment_profile_id is not null;
create table public.page_payout_assignment_history(
 id bigint generated always as identity primary key,page_id text not null references public.pages(id) on delete restrict,
 previous_payment_profile_id uuid references public.payment_profiles(id) on delete restrict,
 payment_profile_id uuid not null references public.payment_profiles(id) on delete restrict,
 actor_user_id uuid references auth.users(id),note text,created_at timestamptz not null default now()
);
alter table public.page_payout_assignments enable row level security;
alter table public.page_payout_assignment_history enable row level security;
create index page_payout_history_page_idx on public.page_payout_assignment_history(page_id,created_at desc);
revoke all on public.page_payout_assignments,public.page_payout_assignment_history from public,anon,authenticated;
grant all on public.page_payout_assignments,public.page_payout_assignment_history to service_role;
grant usage,select on sequence public.page_payout_assignment_history_id_seq to service_role;
insert into public.page_payout_assignments(page_id,payment_profile_id)
 select l.page_id,min(l.payment_profile_id::text)::uuid from public.page_payment_profiles l join public.inhouse_page_inventory h on h.page_id=l.page_id group by l.page_id having count(distinct l.payment_profile_id)=1;

create or replace function public.inhouse_payout_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile_id uuid;existing public.payment_profiles%rowtype;page_key text;ext text;previous_id uuid;
begin
 if not public.operations_allowed(p_actor,'sales_operations','manage_payout') then raise exception 'Forbidden';end if;
 if not public.operations_page_visible(p_actor,p_input->>'page_id') then raise exception 'Forbidden';end if;
 page_key:=p_input->>'page_id';perform pg_advisory_xact_lock(hashtextextended('page-payout:'||page_key,0));
 perform 1 from public.inhouse_page_inventory where page_id=page_key for update;if not found then raise exception 'Invalid Inhouse Page';end if;
 if nullif(p_input->>'payment_profile_id','') is not null then
  profile_id:=(p_input->>'payment_profile_id')::uuid;
  if not exists(select 1 from public.payment_profiles where id=profile_id and status='active') then raise exception 'Invalid active payout profile';end if;
 else
  if coalesce(nullif(p_input->>'currency',''),'USD') not in ('USD','VND') then raise exception 'Invalid payout currency';end if;
  ext:=btrim(p_input->>'external_id');if coalesce(ext,'')='' or length(ext)>200 then raise exception 'Invalid payout identifier';end if;
  perform pg_advisory_xact_lock(hashtextextended('inhouse-payout:'||ext,0));
  select * into existing from public.payment_profiles where external_id=ext for update;
  if found then raise exception 'Payout identifier exists; attach existing profile';end if;
  insert into public.payment_profiles(external_id,profile_name,recipient_name,recipient_account,currency,note,source,last_synced_at)
  values(ext,nullif(btrim(p_input->>'profile_name'),''),p_input->>'recipient_name',p_input->>'recipient_account',coalesce(nullif(p_input->>'currency',''),'USD'),p_input->>'note','manual_inhouse',null) returning id into profile_id;
 end if;
 select payment_profile_id into previous_id from public.page_payout_assignments where page_id=page_key for update;
 insert into public.page_payout_assignments(page_id,payment_profile_id,assigned_by) values(page_key,profile_id,p_actor)
  on conflict(page_id) do update set payment_profile_id=excluded.payment_profile_id,assigned_by=p_actor,updated_at=now();
 if previous_id is distinct from profile_id then insert into public.page_payout_assignment_history(page_id,previous_payment_profile_id,payment_profile_id,actor_user_id,note) values(page_key,previous_id,profile_id,p_actor,p_input->>'note');end if;
 insert into public.page_payment_profiles(page_id,payment_profile_id,relation_type) values(page_key,profile_id,'manual_inhouse') on conflict(page_id,payment_profile_id) do nothing;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'inhouse_payout_save','page',page_key,jsonb_build_object('payment_profile_id',profile_id,'previous_payment_profile_id',previous_id));
 return jsonb_build_object('ok',true,'payment_profile_id',profile_id);
end $$;

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
  select coalesce(report.payment_profile_id,p.payment_profile_id) into payout_id from public.page_payout_assignments p where p.page_id=assignment.page_id;
  if payout_id is null then raise exception 'Page payout required';end if;
  if unit='USD' and not exists(select 1 from public.payment_profiles where id=payout_id and currency='USD' and status='active') then raise exception 'USD payout required';end if;
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
 return jsonb_build_object('ok',true,'report',to_jsonb(report));
end $$;
revoke all on function public.inhouse_payout_save(uuid,jsonb),public.content_report_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.inhouse_payout_save(uuid,jsonb),public.content_report_command(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
