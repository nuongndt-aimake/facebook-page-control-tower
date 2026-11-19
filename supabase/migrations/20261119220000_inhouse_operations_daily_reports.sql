-- CLI generated 20261119122426; sequenced after Gate 2.2 dependency.
alter table public.sales_inventory_items drop constraint sales_inventory_items_status_check;
alter table public.sales_inventory_items add constraint sales_inventory_items_status_check check(status in ('draft','available','reserved','external_sold','inhouse_transferred','cancelled','damaged'));
alter table public.sales_inventory_ledger drop constraint sales_inventory_ledger_action_check;
alter table public.sales_inventory_ledger add constraint sales_inventory_ledger_action_check check(action in ('received','published','reserved','reservation_released','external_sold','inhouse_transferred','cancelled','corrected','damaged'));
create table public.sales_inventory_writeoffs(
 inventory_item_id uuid primary key references public.sales_inventory_items(id) on delete restrict,
 cost_vnd bigint not null check(cost_vnd>=0), revenue_vnd bigint not null default 0 check(revenue_vnd=0),
 reason text not null check(length(btrim(reason))>0), actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table public.content_report_revisions(
 id bigint generated always as identity primary key, report_id uuid not null references public.content_assignment_daily_reports(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id),action text not null,previous_data jsonb,new_data jsonb not null,created_at timestamptz not null default now()
);
create index content_report_revisions_report_idx on public.content_report_revisions(report_id,created_at desc);
alter table public.sales_inventory_writeoffs enable row level security;
alter table public.content_report_revisions enable row level security;
revoke all on public.sales_inventory_writeoffs,public.content_report_revisions from anon,authenticated;

create function public.operations_allowed(p_actor uuid,p_family text,p_scope text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select status='active' and (role in ('platform_admin','super_admin') or permissions->p_family='true'::jsonb or permissions->p_family='"*"'::jsonb or (jsonb_typeof(permissions->p_family)='array' and (permissions->p_family ? p_scope or permissions->p_family ? '*'))) from public.profiles where id=p_actor),false)
$$;
create function public.operations_visible_users(p_actor uuid) returns setof uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive edges as (
 select employee_user_id as uid,manager_user_id as parent from public.user_reporting_lines where status='active'
 union select user_id,parent_user_id from public.team_memberships where status='active'
 ), branch(id) as(select p_actor union select e.uid from edges e join branch b on b.id=e.parent)
 select id from branch where id is not null
$$;
create function public.sales_inventory_writeoff(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.sales_inventory_items%rowtype; loss public.sales_inventory_writeoffs%rowtype; amount bigint;why text;
begin
 if not public.operations_allowed(p_actor,'sales_inventory','writeoff') then raise exception 'Forbidden';end if;
 select * into item from public.sales_inventory_items where id=(p_input->>'inventory_item_id')::uuid for update;
 if not found then raise exception 'Invalid inventory item';end if;
 if item.status='damaged' then return jsonb_build_object('ok',true,'duplicate',true);end if;
 if item.status not in ('draft','available','inhouse_transferred') then raise exception 'Cannot write off reserved or sold inventory';end if;
 why:=btrim(p_input->>'reason');if coalesce(why,'')='' then raise exception 'Invalid damage reason';end if;
 amount:=coalesce(item.purchase_cost_vnd,nullif(p_input->>'purchase_cost_vnd','')::bigint);if amount is null or amount<0 then raise exception 'Invalid purchase cost required';end if;
 insert into public.sales_inventory_writeoffs(inventory_item_id,cost_vnd,reason,actor_user_id) values(item.id,amount,why,p_actor) returning * into loss;
 update public.sales_inventory_items set status='damaged',purchase_cost_vnd=amount,updated_at=now() where id=item.id;
 update public.inhouse_page_inventory set status='suspended',note=concat_ws(E'\n',note,'Page hỏng: '||why) where inventory_item_id=item.id;
 update public.pages set current_status='damaged',updated_at=now() where id in(select page_id from public.inhouse_page_inventory where inventory_item_id=item.id);
 insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,actor_user_id,reason,metadata) values(item.id,'damaged',item.status,'damaged',p_actor,why,jsonb_build_object('cost_vnd',amount,'revenue_vnd',0));
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'inventory_writeoff','sales_inventory_item',item.id,jsonb_build_object('cost_vnd',amount,'revenue_vnd',0,'reason',why));
 return jsonb_build_object('ok',true,'writeoff',to_jsonb(loss));
end $$;

alter table public.payment_profiles alter column last_synced_at drop not null;
create function public.inhouse_payout_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile_id uuid;existing public.payment_profiles%rowtype;page_key text;ext text;
begin
 if not public.operations_allowed(p_actor,'sales_operations','manage_payout') then raise exception 'Forbidden';end if;
 page_key:=p_input->>'page_id';perform 1 from public.inhouse_page_inventory where page_id=page_key for update;if not found then raise exception 'Invalid Inhouse Page';end if;
 if nullif(p_input->>'payment_profile_id','') is not null then
  profile_id:=(p_input->>'payment_profile_id')::uuid;
  if not exists(select 1 from public.payment_profiles where id=profile_id) then raise exception 'Invalid payout profile';end if;
 else
  ext:=btrim(p_input->>'external_id');if coalesce(ext,'')='' or length(ext)>200 then raise exception 'Invalid payout identifier';end if;
  perform pg_advisory_xact_lock(hashtextextended('inhouse-payout:'||ext,0));
  select * into existing from public.payment_profiles where external_id=ext for update;
  if found then raise exception 'Payout identifier exists; attach existing profile';end if;
  insert into public.payment_profiles(external_id,profile_name,recipient_name,recipient_account,currency,note,source,last_synced_at)
  values(ext,nullif(btrim(p_input->>'profile_name'),''),p_input->>'recipient_name',p_input->>'recipient_account',coalesce(nullif(p_input->>'currency',''),'USD'),p_input->>'note','manual_inhouse',null) returning id into profile_id;
 end if;
 insert into public.page_payment_profiles(page_id,payment_profile_id,relation_type) values(page_key,profile_id,'manual_inhouse') on conflict(page_id,payment_profile_id) do nothing;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'inhouse_payout_save','page',page_key,jsonb_build_object('payment_profile_id',profile_id));
 return jsonb_build_object('ok',true,'payment_profile_id',profile_id);
end $$;

create function public.content_report_command(p_action text,p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype;assignment public.page_assignments%rowtype;report public.content_assignment_daily_reports%rowtype;previous jsonb;
 d date;posts integer;revenue numeric;cumulative numeric;note text;is_all boolean;
begin
 select * into actor from public.profiles where id=p_actor;if not found or actor.status is distinct from 'active' then raise exception 'Forbidden';end if;
 if p_action='submit' then
  select * into assignment from public.page_assignments where id=(p_input->>'assignment_id')::uuid for update;
  if not found or assignment.user_id is distinct from p_actor or assignment.status<>'active' then raise exception 'Forbidden';end if;
  if not exists(select 1 from public.inhouse_page_inventory h join public.sales_inventory_items i on i.id=h.inventory_item_id where h.page_id=assignment.page_id and h.status='active' and i.status='inhouse_transferred') then raise exception 'Page is not active Inhouse';end if;
  d:=(p_input->>'report_date')::date;
  if d is null or d>(now() at time zone 'Asia/Ho_Chi_Minh')::date or d<(assignment.assigned_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Invalid report date';end if;
  posts:=(p_input->>'published_post_count')::integer;revenue:=(p_input->>'revenue_vnd')::numeric;cumulative:=(p_input->>'cumulative_revenue_vnd')::numeric;
  if posts is null or posts<0 or revenue is null or revenue<0 or cumulative is null or cumulative<0 or revenue<>round(revenue,2) or cumulative<>round(cumulative,2) then raise exception 'Invalid report numbers';end if;
  if nullif(p_input->>'source_reference','') is not null and p_input->>'source_reference'!~'^https://' then raise exception 'Invalid evidence URL';end if;
  perform pg_advisory_xact_lock(hashtextextended(assignment.id::text||':'||d::text,0));
  select * into report from public.content_assignment_daily_reports where assignment_id=assignment.id and report_date=d for update;
  previous:=case when found then to_jsonb(report) else null end;
  if report.status='verified' then raise exception 'Verified report is locked';end if;
  insert into public.content_assignment_daily_reports(assignment_id,page_id,reporter_user_id,report_date,published_post_count,revenue_vnd,cumulative_revenue_vnd,source_kind,source_reference,evidence)
  values(assignment.id,assignment.page_id,p_actor,d,posts,revenue,cumulative,'manual',nullif(p_input->>'source_reference',''),jsonb_build_object('note',left(p_input->>'note',4000)))
  on conflict(assignment_id,report_date) do update set published_post_count=excluded.published_post_count,revenue_vnd=excluded.revenue_vnd,cumulative_revenue_vnd=excluded.cumulative_revenue_vnd,source_reference=excluded.source_reference,evidence=excluded.evidence,status='submitted',submitted_at=now(),verified_at=null,verified_by=null,verification_note=null,updated_at=now() returning * into report;
 elsif p_action in ('verify','reject') then
  if not public.operations_allowed(p_actor,'sales_operations','verify_reports') then raise exception 'Forbidden';end if;
  select * into report from public.content_assignment_daily_reports where id=(p_input->>'report_id')::uuid for update;
  if not found then raise exception 'Invalid report';end if;
  is_all:=public.operations_allowed(p_actor,'sales_operations','read_reports_all');
  if report.reporter_user_id=p_actor or (not is_all and report.reporter_user_id not in(select public.operations_visible_users(p_actor))) then raise exception 'Forbidden';end if;
  if report.status=(case when p_action='verify' then 'verified' else 'rejected' end) then return jsonb_build_object('ok',true,'duplicate',true);end if;
  if report.status='verified' then raise exception 'Verified report is locked';end if;
  note:=btrim(p_input->>'note');if p_action='reject' and coalesce(note,'')='' then raise exception 'Invalid rejection reason';end if;
  previous:=to_jsonb(report);
  update public.content_assignment_daily_reports set status=case when p_action='verify' then 'verified' else 'rejected' end,verified_at=now(),verified_by=p_actor,verification_note=note,updated_at=now() where id=report.id returning * into report;
 else raise exception 'Invalid report action';end if;
 insert into public.content_report_revisions(report_id,actor_user_id,action,previous_data,new_data) values(report.id,p_actor,p_action,previous,to_jsonb(report));
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'content_report_'||p_action,'content_report',report.id,jsonb_build_object('assignment_id',report.assignment_id,'report_date',report.report_date));
 return jsonb_build_object('ok',true,'report',to_jsonb(report));
end $$;
revoke all on function public.operations_allowed(uuid,text,text),public.operations_visible_users(uuid),public.sales_inventory_writeoff(uuid,jsonb),public.inhouse_payout_save(uuid,jsonb),public.content_report_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.operations_allowed(uuid,text,text),public.operations_visible_users(uuid),public.sales_inventory_writeoff(uuid,jsonb),public.inhouse_payout_save(uuid,jsonb),public.content_report_command(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
