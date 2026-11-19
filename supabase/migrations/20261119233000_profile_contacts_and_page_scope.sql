-- CLI-generated 20261119150126; ordered after USD/payout dependencies.
alter table public.profiles add column facebook_profile_url text check(facebook_profile_url is null or facebook_profile_url ~ '^https://(www\.|m\.|web\.)?facebook\.com/.+');
create function public.operations_scope_users(p_actor uuid) returns setof uuid language sql stable security invoker set search_path=public,pg_temp as $$
 select p.id from public.profiles p join public.profiles a on a.id=p_actor and a.status='active'
 where a.role in ('platform_admin','super_admin') or p.id=p_actor or (a.role='manager' and p.id in(select public.operations_visible_users(p_actor)))
$$;
create function public.operations_page_visible(p_actor uuid,p_page text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles a where a.id=p_actor and a.status='active' and (
  a.role in ('platform_admin','super_admin')
  or exists(select 1 from public.page_assignments x where x.page_id=p_page and x.status='active' and x.user_id in(select public.operations_scope_users(p_actor)))
  or exists(select 1 from public.page_access x where x.page_id=p_page and x.status='active' and x.user_id in(select public.operations_scope_users(p_actor)))
  or (not exists(select 1 from public.page_assignments x where x.page_id=p_page and x.status='active') and exists(select 1 from public.inhouse_page_inventory h where h.page_id=p_page and h.transferred_by in(select public.operations_scope_users(p_actor))))
 ))
$$;
create function public.operations_visible_pages(p_actor uuid) returns setof text language sql stable security invoker set search_path=public,pg_temp as $$
 select id from public.pages where public.operations_page_visible(p_actor,id)
$$;
create function public.operations_inventory_visible(p_actor uuid,p_item uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.sales_inventory_items i join public.profiles a on a.id=p_actor and a.status='active' where i.id=p_item and (
  a.role in ('platform_admin','super_admin') or
  case when i.status='inhouse_transferred' then exists(select 1 from public.inhouse_page_inventory h where h.inventory_item_id=i.id and public.operations_page_visible(p_actor,h.page_id))
  else i.created_by in(select public.operations_scope_users(p_actor)) or exists(select 1 from public.fanpage_inventory_details d where d.inventory_item_id=i.id and public.operations_page_visible(p_actor,d.facebook_page_id)) end
 ))
$$;
create function public.operations_inventory_scope(p_actor uuid) returns setof uuid language sql stable security invoker set search_path=public,pg_temp as $$
 select id from public.sales_inventory_items where public.operations_inventory_visible(p_actor,id)
$$;
revoke all on function public.operations_scope_users(uuid),public.operations_page_visible(uuid,text),public.operations_visible_pages(uuid),public.operations_inventory_visible(uuid,uuid),public.operations_inventory_scope(uuid) from public,anon,authenticated;
grant execute on function public.operations_scope_users(uuid),public.operations_page_visible(uuid,text),public.operations_visible_pages(uuid),public.operations_inventory_visible(uuid,uuid),public.operations_inventory_scope(uuid) to service_role;
create function public.profile_contacts_save(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype;phone_value text;facebook_value text;
begin
 select * into actor from public.profiles where id=p_actor for update;if not found or actor.status<>'active' then raise exception 'Forbidden';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input='{}'::jsonb or p_input-array['phone','facebook_profile_url']<>'{}'::jsonb then raise exception 'Invalid contact fields';end if;
 phone_value:=case when p_input ? 'phone' then nullif(btrim(p_input->>'phone'),'') else actor.phone end;
 facebook_value:=case when p_input ? 'facebook_profile_url' then nullif(btrim(p_input->>'facebook_profile_url'),'') else actor.facebook_profile_url end;
 if p_input ? 'phone' and phone_value is not null and (length(phone_value)>32 or phone_value !~ '^\+?[0-9() .-]+$' or length(regexp_replace(phone_value,'[^0-9]','','g')) not between 7 and 15) then raise exception 'Invalid phone';end if;
 if facebook_value is not null and (length(facebook_value)>2000 or facebook_value !~ '^https://(www\.|m\.|web\.)?facebook\.com/.+') then raise exception 'Invalid Facebook profile';end if;
 update public.profiles set phone=phone_value,facebook_profile_url=facebook_value,updated_at=now() where id=p_actor returning * into actor;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'self_profile_contact_update','profile',p_actor,jsonb_build_object('changed_fields',(select jsonb_agg(k) from jsonb_object_keys(p_input) k)));
 return jsonb_build_object('profile',jsonb_build_object('id',actor.id,'email',actor.email,'display_name',actor.display_name,'phone',actor.phone,'facebook_profile_url',actor.facebook_profile_url,'role',actor.role,'status',actor.status,'permissions',actor.permissions));
end $$;
create function public.sales_inventory_rename_page(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item_id uuid:=(p_input->>'inventory_item_id')::uuid;previous_name text;result jsonb;page_key text;
begin
 if not public.operations_allowed(p_actor,'sales_inventory','intake') or not public.operations_inventory_visible(p_actor,item_id) then raise exception 'Forbidden';end if;
 select page_name into previous_name from public.fanpage_inventory_details where inventory_item_id=item_id for update;
 result:=public.sales_inventory_command('update_page_name',p_actor,p_input);
 select page_id into page_key from public.inhouse_page_inventory where inventory_item_id=item_id;
 if page_key is not null then update public.pages set name=btrim(p_input->>'page_name'),updated_at=now() where id=page_key;end if;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'rename_inventory_page','sales_inventory_item',item_id,jsonb_build_object('previous_name',previous_name,'page_name',btrim(p_input->>'page_name'),'external_facebook_renamed',false));
 return result;
end $$;
revoke all on function public.profile_contacts_save(uuid,jsonb),public.sales_inventory_rename_page(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.profile_contacts_save(uuid,jsonb),public.sales_inventory_rename_page(uuid,jsonb) to service_role;
create function public.operations_account_assets(p_actor uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with visible as (
  select h.page_id,h.status from public.inhouse_page_inventory h where h.status<>'retired' and public.operations_page_visible(p_actor,h.page_id)
 ), assignments as (
  select a.id,a.page_id,a.user_id,a.assignment_role from public.page_assignments a join visible v on v.page_id=a.page_id
  where a.status='active' and a.user_id in(select public.operations_scope_users(p_actor))
 )
 select jsonb_build_object('source','inhouse_current','page_ids',coalesce((select jsonb_agg(page_id order by page_id) from visible),'[]'::jsonb),'assignment_count',(select count(*) from assignments),'direct_page_count',(select count(distinct page_id) from assignments where user_id=p_actor),'payout_count',(select count(distinct p.payment_profile_id) from public.page_payout_assignments p join visible v on v.page_id=p.page_id))
$$;
revoke all on function public.operations_account_assets(uuid) from public,anon,authenticated;
grant execute on function public.operations_account_assets(uuid) to service_role;
notify pgrst,'reload schema';
