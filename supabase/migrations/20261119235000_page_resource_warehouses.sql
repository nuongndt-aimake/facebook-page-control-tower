-- CLI-generated 20261119162344; ordered after current Inhouse scope dependencies.
create table public.page_resource_sources (
 page_id text not null references public.pages(id), kind text not null check(kind in ('image','video')),
 sheet_url text check(sheet_url is null or sheet_url ~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{10,}/edit(#gid=[0-9]{1,12})?$'),
 updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now(),primary key(page_id,kind)
);
create table public.page_resource_grants (
 assignment_id uuid not null references public.page_assignments(id) on delete cascade,kind text not null check(kind in ('image','video')),
 enabled boolean not null default true,updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now(),primary key(assignment_id,kind)
);
alter table public.page_resource_sources enable row level security;
alter table public.page_resource_grants enable row level security;
revoke all on public.page_resource_sources,public.page_resource_grants from public,anon,authenticated;
grant all on public.page_resource_sources,public.page_resource_grants to service_role;
create function public.page_resource_can_manage(p_actor uuid,p_page text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select public.operations_allowed(p_actor,'sales_inventory','assign_inhouse') and public.operations_page_visible(p_actor,p_page)
 and exists(select 1 from public.inhouse_page_inventory where page_id=p_page and status in ('active','awaiting_assignment'))
$$;
create function public.page_resource_can_read(p_actor uuid,p_page text,p_kind text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=p_actor and status='active') and exists(select 1 from public.inhouse_page_inventory where page_id=p_page and status in ('active','awaiting_assignment')) and
 (public.page_resource_can_manage(p_actor,p_page) or exists(select 1 from public.page_assignments a join public.page_resource_grants g on g.assignment_id=a.id where a.page_id=p_page and a.user_id=p_actor and a.status='active' and g.kind=p_kind and g.enabled))
$$;
create function public.page_resource_command(p_action text,p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pg text:=p_input->>'page_id';manage boolean;result jsonb;ass public.page_assignments%rowtype;k text;url text;kinds jsonb:=coalesce(p_input->'resource_kinds','[]'::jsonb);target uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'Forbidden';end if;
 if p_action='list' then
  return jsonb_build_object('pages',coalesce((select jsonb_agg(jsonb_build_object('page_id',h.page_id,'manage',public.page_resource_can_manage(p_actor,h.page_id),'kinds',coalesce((select jsonb_agg(k.kind) from (values('image'),('video')) k(kind) where public.page_resource_can_read(p_actor,h.page_id,k.kind)),'[]'::jsonb))) from public.inhouse_page_inventory h where public.page_resource_can_read(p_actor,h.page_id,'image') or public.page_resource_can_read(p_actor,h.page_id,'video')),'[]'::jsonb));
 end if;
 if p_action='assign' then
  select page_id into pg from public.inhouse_page_inventory where inventory_item_id=(p_input->>'inventory_item_id')::uuid;
 end if;
 manage:=coalesce(public.page_resource_can_manage(p_actor,pg),false);
 if p_action='get' then
  if not public.page_resource_can_read(p_actor,pg,'image') and not public.page_resource_can_read(p_actor,pg,'video') then raise exception 'Forbidden';end if;
  return jsonb_build_object('page_id',pg,'manage',manage,'sources',coalesce((select jsonb_agg(to_jsonb(s)) from public.page_resource_sources s where s.page_id=pg and public.page_resource_can_read(p_actor,pg,s.kind)),'[]'::jsonb),'assignments',case when manage then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'display_name',p.display_name,'resource_kinds',coalesce((select jsonb_agg(g.kind) from public.page_resource_grants g where g.assignment_id=a.id and g.enabled),'[]'::jsonb))) from public.page_assignments a join public.profiles p on p.id=a.user_id where a.page_id=pg and a.status='active'),'[]'::jsonb) else '[]'::jsonb end,'allowed_kinds',coalesce((select jsonb_agg(k.kind) from (values('image'),('video')) k(kind) where public.page_resource_can_read(p_actor,pg,k.kind)),'[]'::jsonb));
 end if;
 if not manage then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('page-resources:'||pg,0));
 if p_action='configure' then
  if jsonb_typeof(p_input->'sources') is distinct from 'object' or (p_input->'sources')-array['image','video']<>'{}'::jsonb then raise exception 'Invalid resource sources';end if;
  foreach k in array array['image','video'] loop
   if p_input->'sources' ? k then
    url:=nullif(btrim(p_input->'sources'->>k),'');
    insert into public.page_resource_sources(page_id,kind,sheet_url,updated_by) values(pg,k,url,p_actor) on conflict(page_id,kind) do update set sheet_url=excluded.sheet_url,updated_by=p_actor,updated_at=now();
   end if;
  end loop;
 elsif p_action in ('assign','grant') then
  if jsonb_typeof(kinds) is distinct from 'array' or jsonb_array_length(kinds)>2 or exists(select 1 from jsonb_array_elements(kinds) v where v not in ('"image"'::jsonb,'"video"'::jsonb)) then raise exception 'Invalid resource kinds';end if;
  if p_action='assign' then
   result:=public.sales_inventory_command('assign_inhouse',p_actor,p_input);target:=(result->>'assignment_id')::uuid;
  else target:=(p_input->>'assignment_id')::uuid;end if;
  select * into ass from public.page_assignments where id=target for update;
  if not found or ass.page_id<>pg or ass.status<>'active' or ass.user_id is null then raise exception 'Forbidden';end if;
  foreach k in array array['image','video'] loop
   insert into public.page_resource_grants(assignment_id,kind,enabled,updated_by) values(target,k,kinds ? k,p_actor) on conflict(assignment_id,kind) do update set enabled=excluded.enabled,updated_by=p_actor,updated_at=now();
  end loop;
 else raise exception 'Invalid resource action';end if;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'page_resources_'||p_action,'page',pg,jsonb_build_object('input',p_input,'google_access_changed',false));
 return coalesce(result,'{}'::jsonb)||jsonb_build_object('ok',true,'page_id',pg);
end $$;
revoke all on function public.page_resource_can_manage(uuid,text),public.page_resource_can_read(uuid,text,text),public.page_resource_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.page_resource_can_manage(uuid,text),public.page_resource_can_read(uuid,text,text),public.page_resource_command(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
