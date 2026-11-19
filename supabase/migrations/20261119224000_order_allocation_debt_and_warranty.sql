alter table public.sales_orders drop constraint sales_orders_fulfillment_status_check;
alter table public.sales_orders add constraint sales_orders_fulfillment_status_check check(fulfillment_status in ('unassigned','assigned','in_progress','completed','cancelled','allocated','granting','page_debt','failed'));
alter table public.sales_order_inventory_items drop constraint sales_order_inventory_items_status_check;
alter table public.sales_order_inventory_items add constraint sales_order_inventory_items_status_check check(status in ('reserved','released','external_sold','inhouse_transferred','replaced'));
create table public.sales_order_warranties(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.sales_orders(id),old_inventory_item_id uuid not null references public.sales_inventory_items(id),replacement_inventory_item_id uuid references public.sales_inventory_items(id),reason text not null,actor_user_id uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','completed')),created_at timestamptz not null default now(),completed_at timestamptz,unique(order_id,old_inventory_item_id));
alter table public.sales_order_warranties enable row level security;revoke all on public.sales_order_warranties from anon,authenticated;
create function public.sales_order_operation_allowed(p_actor uuid,p_order uuid,p_scope text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select public.operations_allowed(p_actor,'sales_inventory',p_scope) and exists(select 1 from public.profiles p where p.id=p_actor and (p.role in ('platform_admin','super_admin') or (jsonb_typeof(p.permissions->'sales_orders')='array' and p.permissions->'sales_orders' ? 'read_all') or exists(select 1 from public.sales_order_assignments a where a.order_id=p_order and a.assignee_user_id=p_actor)))
$$;
create function public.sales_order_allocate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.sales_orders%rowtype;ids uuid[];n integer;dest text;w public.sales_order_warranties%rowtype;replacement uuid;item public.sales_inventory_items%rowtype;detail public.fanpage_inventory_details%rowtype;
begin
 select * into o from public.sales_orders where id=(p_input->>'order_id')::uuid for update;
 if not found or not public.sales_order_operation_allowed(p_actor,o.id,'reserve') then raise exception 'Forbidden';end if;
 if o.payment_status<>'paid' then raise exception 'Order payment or verification incomplete';end if;
 if o.fulfillment_status='completed' then return jsonb_build_object('ok',true,'duplicate',true);end if;
 select count(*) into n from public.sales_order_inventory_items where order_id=o.id and status not in ('released','replaced');
 if n<o.quantity then
  select array_agg(id order by id) into ids from(select id from public.sales_inventory_items where product_id=o.product_id and status='available' order by created_at,id for update skip locked limit o.quantity-n) available;
  for item in select * from public.sales_inventory_items where id=any(ids) order by id loop
   select * into detail from public.fanpage_inventory_details where inventory_item_id=item.id;if not found then raise exception 'Invalid inventory details';end if;
   update public.sales_inventory_items set status='reserved',reserved_order_ref=o.order_code,reserved_at=now(),updated_at=now() where id=item.id;
   insert into public.sales_order_inventory_items(order_id,inventory_item_id,status,inventory_code,page_name,facebook_page_id,reserved_by) values(o.id,item.id,'reserved',item.inventory_code,detail.page_name,detail.facebook_page_id,p_actor) on conflict(order_id,inventory_item_id) do update set status='reserved',reserved_by=p_actor,reserved_at=now(),finalized_at=null;
   insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,'reserved','available','reserved',o.order_code,p_actor,'Tự đề xuất khi xử lý đơn');
  end loop;
 end if;
 select count(*) into n from public.sales_order_inventory_items where order_id=o.id and status not in ('released','replaced');
 dest:=case when n<o.quantity then 'page_debt' when o.fulfillment_status='granting' then 'granting' else 'allocated' end;
 update public.sales_orders set fulfillment_status=dest,updated_at=now() where id=o.id;
 for w in select * from public.sales_order_warranties where order_id=o.id and status='pending' and replacement_inventory_item_id is null order by created_at for update loop
  select i.inventory_item_id into replacement from public.sales_order_inventory_items i where i.order_id=o.id and i.status='reserved' and not exists(select 1 from public.sales_order_warranties x where x.replacement_inventory_item_id=i.inventory_item_id) order by i.reserved_at desc limit 1;
  if replacement is not null then update public.sales_order_warranties set replacement_inventory_item_id=replacement where id=w.id;end if;
 end loop;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'allocate_sales_order','sales_order',o.id,jsonb_build_object('allocated',n,'missing',greatest(o.quantity-n,0)));
 return jsonb_build_object('ok',true,'allocated_quantity',n,'missing_quantity',greatest(o.quantity-n,0),'fulfillment_status',dest);
end $$;
create function public.sales_order_finish(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.sales_orders%rowtype;item public.sales_inventory_items%rowtype;d public.fanpage_inventory_details%rowtype;n integer;dest text;
begin
 select * into o from public.sales_orders where id=(p_input->>'order_id')::uuid for update;
 if not found or not public.sales_order_operation_allowed(p_actor,o.id,'finalize') then raise exception 'Forbidden';end if;
 if o.fulfillment_status='completed' then return jsonb_build_object('ok',true,'duplicate',true);end if;
 if o.payment_status<>'paid' or (o.expected_amount_vnd=0 and o.zero_value_verification_status is distinct from 'verified') then raise exception 'Order payment or verification incomplete';end if;
 select count(*) into n from public.sales_order_inventory_items where order_id=o.id and status not in ('released','replaced');if n<>o.quantity then raise exception 'Reserve exactly the order quantity before handover';end if;
 if p_input->>'action'='start_handover' then update public.sales_orders set fulfillment_status='granting',updated_at=now() where id=o.id;return jsonb_build_object('ok',true);end if;
 if coalesce((p_input->>'access_granted')::boolean,false) is not true then raise exception 'Access handover confirmation required';end if;
 dest:=case when o.fulfillment_destination='inhouse' then 'inhouse_transferred' else 'external_sold' end;
 for item in select * from public.sales_inventory_items where id in(select inventory_item_id from public.sales_order_inventory_items where order_id=o.id and status='reserved') order by id for update loop
  if item.status<>'reserved' or item.reserved_order_ref is distinct from o.order_code then raise exception 'Reservation does not match';end if;
  if dest='inhouse_transferred' then
   select * into d from public.fanpage_inventory_details where inventory_item_id=item.id;
   if exists(select 1 from public.pages where id=d.facebook_page_id) then raise exception 'Page registry already exists';end if;
   insert into public.pages(id,name,meta_connection,updated_at,registry_source,custody_status) values(d.facebook_page_id,d.page_name,'sales_inventory',now(),'sales_inventory','intake');
   insert into public.inhouse_page_inventory(inventory_item_id,page_id,transferred_by,note) values(item.id,d.facebook_page_id,p_actor,p_input->>'reason');
  end if;
  update public.sales_inventory_items set status=dest,sold_order_ref=o.order_code,sold_at=now(),reserved_order_ref=null,reserved_at=null,updated_at=now() where id=item.id;
  update public.sales_order_inventory_items set status=dest,finalized_at=now() where order_id=o.id and inventory_item_id=item.id;
  insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,dest,'reserved',dest,o.order_code,p_actor,p_input->>'reason');
 end loop;
 update public.sales_order_warranties set status='completed',completed_at=now() where order_id=o.id and replacement_inventory_item_id is not null and status='pending';
 update public.sales_orders set fulfillment_status='completed',updated_at=now() where id=o.id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'finish_sales_order','sales_order',o.id,jsonb_build_object('access_granted',true));return jsonb_build_object('ok',true);
end $$;
create function public.sales_order_warranty(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.sales_orders%rowtype;old_item public.sales_inventory_items%rowtype;replacement public.sales_inventory_items%rowtype;d public.fanpage_inventory_details%rowtype;w public.sales_order_warranties%rowtype;why text;cost bigint;
begin
 select * into o from public.sales_orders where id=(p_input->>'order_id')::uuid for update;
 if not found or not public.sales_order_operation_allowed(p_actor,o.id,'warranty') then raise exception 'Forbidden';end if;
 if o.payment_status<>'paid' then raise exception 'Order payment or verification incomplete';end if;
 select * into old_item from public.sales_inventory_items where id=(p_input->>'inventory_item_id')::uuid for update;
 if not found then raise exception 'Invalid inventory item';end if;
 select * into w from public.sales_order_warranties where order_id=o.id and old_inventory_item_id=old_item.id;
 if found then return jsonb_build_object('ok',true,'duplicate',true,'warranty',to_jsonb(w));end if;
 if not exists(select 1 from public.sales_order_inventory_items where order_id=o.id and inventory_item_id=old_item.id and status in ('reserved','external_sold','inhouse_transferred')) then raise exception 'Inventory does not match order';end if;
 why:=btrim(p_input->>'reason');cost:=coalesce(old_item.purchase_cost_vnd,nullif(p_input->>'purchase_cost_vnd','')::bigint);if coalesce(why,'')='' or cost is null or cost<0 then raise exception 'Invalid warranty reason or cost';end if;
 if nullif(p_input->>'replacement_inventory_item_id','') is not null then
  select * into replacement from public.sales_inventory_items where id=(p_input->>'replacement_inventory_item_id')::uuid and product_id=o.product_id and status='available' for update;if not found then raise exception 'Inventory item is not available';end if;
 else select * into replacement from public.sales_inventory_items where product_id=o.product_id and status='available' order by created_at,id for update skip locked limit 1;end if;
 update public.sales_order_inventory_items set status='replaced' where order_id=o.id and inventory_item_id=old_item.id;
 update public.sales_inventory_items set status='damaged',purchase_cost_vnd=cost,reserved_order_ref=null,reserved_at=null,updated_at=now() where id=old_item.id;
 insert into public.sales_inventory_writeoffs(inventory_item_id,cost_vnd,reason,actor_user_id) values(old_item.id,cost,why,p_actor) on conflict(inventory_item_id) do nothing;
 update public.inhouse_page_inventory set status='suspended' where inventory_item_id=old_item.id;update public.pages set current_status='damaged' where id in(select page_id from public.inhouse_page_inventory where inventory_item_id=old_item.id);
 insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason,metadata) values(old_item.id,'damaged',old_item.status,'damaged',o.order_code,p_actor,why,jsonb_build_object('cost_vnd',cost,'revenue_vnd',0,'warranty',true));
 if replacement.id is not null then
  select * into d from public.fanpage_inventory_details where inventory_item_id=replacement.id;
  update public.sales_inventory_items set status='reserved',reserved_order_ref=o.order_code,reserved_at=now(),updated_at=now() where id=replacement.id;
  insert into public.sales_order_inventory_items(order_id,inventory_item_id,status,inventory_code,page_name,facebook_page_id,reserved_by) values(o.id,replacement.id,'reserved',replacement.inventory_code,d.page_name,d.facebook_page_id,p_actor);
  insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(replacement.id,'reserved','available','reserved',o.order_code,p_actor,'Đổi bảo hành: '||why);
 end if;
 insert into public.sales_order_warranties(order_id,old_inventory_item_id,replacement_inventory_item_id,reason,actor_user_id) values(o.id,old_item.id,replacement.id,why,p_actor) returning * into w;
 update public.sales_orders set fulfillment_status=case when replacement.id is null then 'page_debt' else 'allocated' end,updated_at=now() where id=o.id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'warranty_sales_order','sales_order',o.id,to_jsonb(w));return jsonb_build_object('ok',true,'warranty',to_jsonb(w),'missing_quantity',case when replacement.id is null then 1 else 0 end);
end $$;
revoke all on function public.sales_order_operation_allowed(uuid,uuid,text),public.sales_order_allocate(uuid,jsonb),public.sales_order_finish(uuid,jsonb),public.sales_order_warranty(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_order_operation_allowed(uuid,uuid,text),public.sales_order_allocate(uuid,jsonb),public.sales_order_finish(uuid,jsonb),public.sales_order_warranty(uuid,jsonb) to service_role;
create or replace function public.sales_checkout_create(p_order jsonb,p_invoice jsonb)
returns public.sales_orders language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.sales_orders%rowtype; item public.sales_inventory_items%rowtype; detail public.fanpage_inventory_details%rowtype;
 ids uuid[]; q integer; configured bigint;
begin
 q:=(p_order->>'quantity')::integer;if q is null or q<1 or q>100 then raise exception 'Invalid quantity';end if;
 select coalesce((select unit_price_vnd from public.sales_product_prices where product_id=p.id and effective_from<=now() and (effective_until is null or effective_until>now()) order by effective_from desc limit 1),p.unit_price_vnd)
 into configured from public.sales_products p where id=(p_order->>'product_id')::uuid and status='active' and product_group='fanpage';
 if configured is null or configured<>(p_order->>'unit_price_vnd')::bigint then raise exception 'Price changed; please retry';end if;
 select array_agg(id order by id) into ids from (select id from public.sales_inventory_items where product_id=(p_order->>'product_id')::uuid and status='available' order by created_at,id for update skip locked limit q) stock;
 -- Accept backorders; only existing stock is reserved.
 insert into public.sales_orders(order_code,product_id,buyer_user_id,buyer_name,buyer_phone,buyer_email,fulfillment_profile_url,quantity,unit_price_vnd,gross_amount_vnd,discount_percent,discount_amount_vnd,referral_code,promo_code,promo_discount_vnd,gift_name,gift_download_url,expected_amount_vnd,payment_reference,payment_expires_at,zero_value_verification_status,fulfillment_status)
 values(p_order->>'order_code',(p_order->>'product_id')::uuid,nullif(p_order->>'buyer_user_id','')::uuid,p_order->>'buyer_name',p_order->>'buyer_phone',p_order->>'buyer_email',p_order->>'fulfillment_profile_url',q,configured,(p_order->>'gross_amount_vnd')::bigint,(p_order->>'discount_percent')::integer,(p_order->>'discount_amount_vnd')::bigint,p_order->>'referral_code',p_order->>'promo_code',(p_order->>'promo_discount_vnd')::bigint,p_order->>'gift_name',p_order->>'gift_download_url',(p_order->>'expected_amount_vnd')::bigint,p_order->>'payment_reference',nullif(p_order->>'payment_expires_at','')::timestamptz,p_order->>'zero_value_verification_status','in_progress') returning * into o;
 insert into public.sales_invoice_records(order_id,invoice_type,invoice_status,aggregation_date,customer_name,tax_code,billing_address,billing_email)
 values(o.id,case when coalesce((p_invoice->>'requested')::boolean,false) then 'individual' else 'daily_aggregate' end,'pending_payment',(now() at time zone 'Asia/Ho_Chi_Minh')::date,p_invoice->>'customer_name',p_invoice->>'tax_code',p_invoice->>'billing_address',p_invoice->>'billing_email');
 for item in select * from public.sales_inventory_items where id=any(ids) order by id loop
   select * into detail from public.fanpage_inventory_details where inventory_item_id=item.id;
   if detail.inventory_item_id is null then raise exception 'Inventory details not found';end if;
   update public.sales_inventory_items set status='reserved',reserved_order_ref=o.order_code,reserved_at=now(),updated_at=now() where id=item.id;
   insert into public.sales_order_inventory_items(order_id,inventory_item_id,status,inventory_code,page_name,facebook_page_id,reserved_by) values(o.id,item.id,'reserved',item.inventory_code,detail.page_name,detail.facebook_page_id,o.buyer_user_id);
   insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,'reserved','available','reserved',o.order_code,o.buyer_user_id,'public_checkout');
 end loop;
 if o.buyer_user_id is not null then update public.profiles set phone=o.buyer_phone,updated_at=now() where id=o.buyer_user_id and nullif(phone,'') is null;end if;
 if o.expected_amount_vnd=0 then update public.sales_orders set fulfillment_destination='inhouse' where id=o.id returning * into o;end if;
 update public.sales_orders set fulfillment_status=case when coalesce(cardinality(ids),0)<q then 'page_debt' else 'in_progress' end where id=o.id returning * into o;
 return o;
end; $$;
notify pgrst,'reload schema';
