-- Opening stock import: existing held assets, not a new Facebook handover.
create table public.sales_inventory_import_batches(
 batch_key text primary key, source_sha256 text not null,
 actor_user_id uuid not null references auth.users(id),
 result jsonb not null, created_at timestamptz not null default now()
);
alter table public.sales_inventory_import_batches enable row level security;
revoke all on public.sales_inventory_import_batches from public,anon,authenticated;
grant all on public.sales_inventory_import_batches to service_role;

create function public.sales_import_held_inhouse_batch(p_actor uuid,p_batch_key text,p_source_sha256 text,p_pages jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype; prior public.sales_inventory_import_batches%rowtype;
 d public.fanpage_inventory_details%rowtype; item public.sales_inventory_items%rowtype;
 entry jsonb; response jsonb; result jsonb; orders jsonb:='[]'; ids uuid[]:='{}'; chunk uuid[];
 product uuid; v_order_id uuid; v_order_code text; page_key text; scope text; item_id uuid;
 created_count integer:=0; reused_count integer:=0; n integer; offset_n integer;
begin
 select * into actor from public.profiles where id=p_actor;
 if not found or actor.status<>'active' or actor.role not in ('operator','manager','platform_admin','super_admin') then raise exception 'Forbidden';end if;
 foreach scope in array array['read','intake','publish','reserve','finalize','assign_inhouse'] loop
  if not public.operations_allowed(p_actor,'sales_inventory',scope) then raise exception 'Forbidden';end if;
 end loop;
 if p_batch_key is null or length(p_batch_key) not between 1 and 150 or p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$' or jsonb_typeof(p_pages) is distinct from 'array' then raise exception 'Invalid import batch';end if;
 n:=jsonb_array_length(p_pages);if n<1 or n>500 then raise exception 'Invalid import size';end if;
 perform pg_advisory_xact_lock(hashtextextended('held-inhouse:'||p_batch_key,0));
 select * into prior from public.sales_inventory_import_batches where batch_key=p_batch_key;
 if found then
  if prior.actor_user_id<>p_actor or prior.source_sha256<>p_source_sha256 then raise exception 'Batch identity mismatch';end if;
  return prior.result||jsonb_build_object('duplicate',true);
 end if;
 if (select count(distinct ltrim(btrim(value->>'facebook_page_id'),'0')) from jsonb_array_elements(p_pages))<>n then raise exception 'Duplicate Page ID';end if;
 select id into product from public.sales_products where product_group='fanpage' and status='active' order by created_at,id limit 1;
 if product is null then raise exception 'Active Fanpage product required';end if;
 for entry in select value from jsonb_array_elements(p_pages) loop
  page_key:=ltrim(btrim(entry->>'facebook_page_id'),'0');
  if page_key is null or page_key!~'^[0-9]+$' or nullif(btrim(entry->>'page_name'),'') is null or length(entry->>'page_name')>255
   or coalesce(entry->>'page_link','')!~'^https://(www\.|m\.)?facebook\.com/' or nullif(btrim(entry->>'current_admin_reference'),'') is null then raise exception 'Invalid Page information';end if;
  perform pg_advisory_xact_lock(hashtextextended('held-page:'||page_key,0));
  if exists(select 1 from public.pages where id=page_key) then raise exception 'Page registry already exists: %',page_key;end if;
  select * into d from public.fanpage_inventory_details where ltrim(btrim(facebook_page_id),'0')=page_key for update;
  if found then
   select * into item from public.sales_inventory_items where id=d.inventory_item_id for update;
   if item.status not in ('draft','available') or item.reserved_order_ref is not null or item.sold_order_ref is not null or item.product_id<>product then raise exception 'Inventory conflict: %',page_key;end if;
   insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details)
    values(p_actor,'held_import_reuse','sales_inventory_item',item.id,jsonb_build_object('batch_key',p_batch_key,'before',to_jsonb(d),'purchase_cost_vnd',item.purchase_cost_vnd));
   update public.fanpage_inventory_details set page_name=entry->>'page_name',page_link=entry->>'page_link',current_admin_reference=entry->>'current_admin_reference',intake_note=concat_ws(E'\n',intake_note,entry->>'intake_note'),updated_at=now() where inventory_item_id=item.id;
   reused_count:=reused_count+1;
  else
   response:=public.sales_inventory_command('intake',p_actor,entry||jsonb_build_object('product_id',product));
   select * into item from public.sales_inventory_items where id=(response->'item'->>'id')::uuid;
   created_count:=created_count+1;
  end if;
  if item.status='draft' then perform public.sales_inventory_command('publish',p_actor,jsonb_build_object('inventory_item_id',item.id));end if;
  ids:=array_append(ids,item.id);
 end loop;
 for offset_n in 0..((n-1)/100) loop
  chunk:=ids[(offset_n*100+1):least(offset_n*100+100,n)];
  response:=public.sales_inventory_command('create_inhouse_order',p_actor,jsonb_build_object('product_id',product,'buyer_user_id',p_actor,'quantity',cardinality(chunk)));
  v_order_id:=(response->>'order_id')::uuid;v_order_code:=response->>'order_code';orders:=orders||jsonb_build_array(response||jsonb_build_object('quantity',cardinality(chunk)));
  perform public.sales_inventory_command('reserve',p_actor,jsonb_build_object('order_id',v_order_id,'destination','inhouse','inventory_item_ids',to_jsonb(chunk),'reason','Nhập số dư tài sản đang cầm: '||p_batch_key));
  perform public.sales_inventory_command('verify_zero',p_actor,jsonb_build_object('order_id',v_order_id));
  foreach item_id in array chunk loop
   select * into d from public.fanpage_inventory_details where inventory_item_id=item_id;
   insert into public.pages(id,name,meta_connection,updated_at,registry_source,custody_status) values(d.facebook_page_id,d.page_name,'sales_inventory',now(),'sales_inventory','intake');
   insert into public.inhouse_page_inventory(inventory_item_id,page_id,transferred_by,note) values(item_id,d.facebook_page_id,p_actor,'Nhập tài sản đã cầm; không thao tác cấp Facebook mới. Batch '||p_batch_key);
   update public.sales_inventory_items set status='inhouse_transferred',sold_order_ref=v_order_code,sold_at=now(),reserved_order_ref=null,reserved_at=null,updated_at=now() where id=item_id;
   update public.sales_order_inventory_items set status='inhouse_transferred',finalized_at=now() where sales_order_inventory_items.order_id=v_order_id and inventory_item_id=item_id;
   insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason,metadata)
    values(item_id,'inhouse_transferred','reserved','inhouse_transferred',v_order_code,p_actor,'Nhập số dư tài sản đã cầm',jsonb_build_object('batch_key',p_batch_key,'external_access_performed',false));
   perform public.sales_inventory_command('assign_inhouse',p_actor,jsonb_build_object('inventory_item_id',item_id,'user_id',p_actor,'reason','Quản lý theo danh sách người dùng cung cấp'));
   update public.page_assignments set assignment_role='manager',parent_user_id=null where page_id=d.facebook_page_id and user_id=p_actor and status='active';
   update public.page_access set access_level='manager' where page_id=d.facebook_page_id and user_id=p_actor;
  end loop;
  update public.sales_orders set fulfillment_status='completed',updated_at=now() where id=v_order_id;
  insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'import_held_inhouse_order','sales_order',v_order_id,jsonb_build_object('batch_key',p_batch_key,'external_access_performed',false,'opening_stock',true));
 end loop;
 result:=jsonb_build_object('ok',true,'batch_key',p_batch_key,'total',n,'created',created_count,'reused',reused_count,'orders',orders);
 insert into public.sales_inventory_import_batches(batch_key,source_sha256,actor_user_id,result) values(p_batch_key,p_source_sha256,p_actor,result);
 return result;
end $$;
revoke all on function public.sales_import_held_inhouse_batch(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_import_held_inhouse_batch(uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
