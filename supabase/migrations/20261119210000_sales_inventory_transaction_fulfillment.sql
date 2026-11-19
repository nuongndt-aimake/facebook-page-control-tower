-- CLI-generated 20261119104606; ordered after the 203000 Page-name dependency.
create unique index if not exists fanpage_inventory_normalized_id_uidx on public.fanpage_inventory_details(ltrim(btrim(facebook_page_id),'0'));
alter table public.pages add column if not exists registry_source text not null default 'meta';
alter table public.sales_orders add column if not exists fulfillment_destination text not null default 'external';
alter table public.sales_orders drop constraint if exists sales_orders_expected_amount_vnd_check;
alter table public.sales_orders drop constraint if exists sales_orders_expected_amount_nonnegative_check;
alter table public.sales_orders add constraint sales_orders_expected_amount_nonnegative_check check(expected_amount_vnd>=0);
create table if not exists public.sales_order_inventory_items(
 order_id uuid not null references public.sales_orders(id) on delete restrict,
 inventory_item_id uuid not null references public.sales_inventory_items(id) on delete restrict,
 status text not null check(status in ('reserved','released','external_sold','inhouse_transferred')),
 inventory_code text not null,page_name text,facebook_page_id text,
 reserved_by uuid references auth.users(id),reserved_at timestamptz not null default now(),finalized_at timestamptz,
 primary key(order_id,inventory_item_id)
);
create unique index if not exists sales_order_inventory_active_uidx on public.sales_order_inventory_items(inventory_item_id) where status<>'released';
alter table public.sales_order_inventory_items enable row level security;
revoke all on public.sales_order_inventory_items from anon,authenticated;

create or replace function public.sales_inventory_command(p_action text,p_actor uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype; o public.sales_orders%rowtype; item public.sales_inventory_items%rowtype;
 detail public.fanpage_inventory_details%rowtype; scope text; is_admin boolean; target_order_id uuid; item_id uuid;
 ids uuid[]; dest text; page_key text; name text; cost bigint; code text; assignment_id uuid; target_id uuid; n integer;
begin
 select * into actor from public.profiles where id=p_actor;
 if not found or actor.status is distinct from 'active' then raise exception 'Forbidden'; end if;
 is_admin:=actor.role in ('platform_admin','super_admin');
 scope:=case p_action when 'update_page_name' then 'intake' when 'release_order' then 'release' when 'cancel_order' then 'release' when 'create_inhouse_order' then 'finalize' when 'verify_zero' then 'finalize' else p_action end;
 if scope is null or scope not in ('intake','publish','reserve','release','finalize','assign_inhouse') then raise exception 'Invalid inventory action'; end if;
 if not is_admin and not(coalesce(actor.permissions->'sales_inventory','[]'::jsonb) ? scope
   or coalesce(actor.permissions->'sales_inventory','[]'::jsonb) ? '*'
   or coalesce(actor.permissions->'sales_inventory'='true'::jsonb,false) or coalesce(actor.permissions->'sales_inventory'='"*"'::jsonb,false)) then raise exception 'Forbidden'; end if;

 if p_action='intake' then
   page_key:=ltrim(btrim(coalesce(p_input->>'facebook_page_id','')),'0');name:=btrim(coalesce(p_input->>'page_name',''));
   if page_key!~'^[0-9]+$' or name='' or length(name)>255 or coalesce(p_input->>'page_link','')!~'^https?://' then raise exception 'Invalid Page information';end if;
   if not exists(select 1 from public.sales_products where id=(p_input->>'product_id')::uuid and product_group='fanpage') then raise exception 'Invalid Fanpage product';end if;
   cost:=nullif(p_input->>'purchase_cost_vnd','')::bigint;if cost<0 then raise exception 'Invalid purchase cost';end if;
   code:='FPINV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
   insert into public.sales_inventory_items(product_id,inventory_code,purchase_cost_vnd,created_by)
   values((p_input->>'product_id')::uuid,code,cost,p_actor) returning * into item;
   insert into public.fanpage_inventory_details(inventory_item_id,facebook_page_id,page_name,page_link,current_admin_reference,current_bm_reference,intake_note)
   values(item.id,page_key,name,p_input->>'page_link',p_input->>'current_admin_reference',p_input->>'current_bm_reference',p_input->>'intake_note');
   insert into public.sales_inventory_ledger(inventory_item_id,action,to_status,actor_user_id,metadata) values(item.id,'received','draft',p_actor,jsonb_build_object('facebook_page_id',page_key,'page_name',name));
   insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'sales_inventory_intake','sales_inventory_item',item.id,jsonb_build_object('inventory_code',code));
   return jsonb_build_object('item',to_jsonb(item),'inventory_code',code);
 end if;

 if p_action='create_inhouse_order' then
   if actor.role not in ('operator','manager','platform_admin','super_admin') then raise exception 'Forbidden';end if;
   target_id:=nullif(p_input->>'buyer_user_id','')::uuid;
   if not exists(select 1 from public.profiles where id=target_id and status='active' and email is not null) then raise exception 'Target user is not active';end if;
   n:=(p_input->>'quantity')::integer;if n is null or n<1 or n>100 then raise exception 'Invalid quantity';end if;
   select coalesce((select unit_price_vnd from public.sales_product_prices where product_id=p.id and effective_from<=now() and (effective_until is null or effective_until>now()) order by effective_from desc limit 1),p.unit_price_vnd) into cost from public.sales_products p where id=(p_input->>'product_id')::uuid and product_group='fanpage' and status='active';
   if cost is null or cost<=0 then raise exception 'Invalid Fanpage product';end if;
   code:='FS'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
   insert into public.sales_orders(order_code,product_id,buyer_user_id,buyer_name,buyer_email,buyer_phone,quantity,unit_price_vnd,gross_amount_vnd,promo_discount_vnd,expected_amount_vnd,payment_reference,zero_value_verification_status,fulfillment_destination)
   select code,(p_input->>'product_id')::uuid,id,coalesce(display_name,email),email,coalesce(nullif(phone,''),'Noi bo'),n,cost,n*cost,n*cost,0,code,'pending_staff_verification','inhouse' from public.profiles where id=target_id returning * into o;
   insert into public.sales_order_assignments(order_id,assignee_user_id,assigned_by,handover_note) values(o.id,p_actor,p_actor,'Inhouse nội bộ');
   insert into public.sales_invoice_records(order_id,invoice_type,invoice_status,aggregation_date) values(o.id,'daily_aggregate','pending_payment',(now() at time zone 'Asia/Ho_Chi_Minh')::date);
   insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'create_inhouse_order','sales_order',o.id,jsonb_build_object('buyer_user_id',target_id,'quantity',n));
   return jsonb_build_object('order_id',o.id,'order_code',o.order_code);
 end if;
 item_id:=nullif(p_input->>'inventory_item_id','')::uuid;
 if p_action in ('publish','update_page_name','assign_inhouse') then
   select * into item from public.sales_inventory_items where id=item_id for update;if not found then raise exception 'Inventory item not found';end if;
   if p_action='publish' then
     if item.status='available' then return jsonb_build_object('item',to_jsonb(item),'duplicate',true);end if;
     if item.status<>'draft' then raise exception 'Only draft inventory can be published';end if;
     if not exists(select 1 from public.fanpage_inventory_details where inventory_item_id=item.id and nullif(btrim(page_name),'') is not null) then raise exception 'Page name required';end if;
     update public.sales_inventory_items set status='available',updated_at=now() where id=item.id returning * into item;
     insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,actor_user_id) values(item.id,'published','draft','available',p_actor);
   elsif p_action='update_page_name' then
     name:=btrim(coalesce(p_input->>'page_name',''));if name='' or length(name)>255 then raise exception 'Page name required';end if;
     update public.fanpage_inventory_details set page_name=name,updated_at=now() where inventory_item_id=item.id;
     if not found then raise exception 'Inventory details not found';end if;
     insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,actor_user_id,metadata) values(item.id,'corrected',item.status,item.status,p_actor,jsonb_build_object('page_name',name));
   else
     if item.status<>'inhouse_transferred' then raise exception 'Page is not in Inhouse inventory';end if;
     select page_id into page_key from public.inhouse_page_inventory where inventory_item_id=item.id and status in ('awaiting_assignment','active') for update;
     if page_key is null then raise exception 'Inhouse page is suspended or retired';end if;
     target_id:=nullif(p_input->>'user_id','')::uuid;
     if not exists(select 1 from public.profiles where id=target_id and status='active') then raise exception 'Target user is not active';end if;
     select id into assignment_id from public.page_assignments where page_id=page_key and user_id=target_id and status='active' limit 1;
     if assignment_id is null then
       insert into public.page_assignments(page_id,user_id,assignment_role,parent_user_id,note) values(page_key,target_id,'operator',p_actor,p_input->>'reason') returning id into assignment_id;
     end if;
     insert into public.page_access(page_id,user_id,access_level,status,granted_by) values(page_key,target_id,'viewer','active',p_actor)
       on conflict(page_id,user_id) do update set status='active';
     update public.inhouse_page_inventory set status='active',activated_at=coalesce(activated_at,now()) where inventory_item_id=item.id;
     insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'assign_inhouse_page','sales_inventory_item',item.id,jsonb_build_object('user_id',target_id,'assignment_id',assignment_id));
     return jsonb_build_object('assignment_id',assignment_id,'page_id',page_key);
   end if;
   insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'sales_inventory_'||p_action,'sales_inventory_item',item.id,coalesce(p_input,'{}'::jsonb));
   return jsonb_build_object('item',to_jsonb(item));
 end if;

 target_order_id:=nullif(p_input->>'order_id','')::uuid;
 select * into o from public.sales_orders where id=target_order_id for update;if not found then raise exception 'Order not found';end if;
 if not is_admin and not(coalesce(actor.permissions->'sales_orders','[]'::jsonb) ? 'read_all') and not exists(select 1 from public.sales_order_assignments where sales_order_assignments.order_id=o.id and assignee_user_id=p_actor) then raise exception 'Forbidden';end if;
 if p_action='verify_zero' then
   if o.expected_amount_vnd<>0 or o.payment_status in ('cancelled','refunded') then raise exception 'Not a verifiable zero-value order';end if;
   if o.zero_value_verification_status='verified' then return jsonb_build_object('ok',true,'duplicate',true);end if;
   if actor.role not in ('operator','manager','platform_admin','super_admin') then raise exception 'Forbidden';end if;
   update public.sales_orders set payment_status='paid',paid_at=now(),zero_value_verification_status='verified',zero_value_verified_by=p_actor,zero_value_verified_at=now(),updated_at=now() where id=o.id;
   update public.sales_invoice_records set invoice_status=case when invoice_type='individual' then 'ready_to_issue' else 'aggregate_pending' end,updated_at=now() where sales_invoice_records.order_id=o.id and invoice_status not in ('issued','aggregated');
 elsif p_action='reserve' then
   if o.payment_status in ('cancelled','expired','refunded') or o.fulfillment_status in ('cancelled','completed') then raise exception 'Order cannot reserve inventory';end if;
   if o.payment_status<>'paid' and o.payment_expires_at<now() then raise exception 'Order payment expired';end if;
   dest:=coalesce(p_input->>'destination','external');if dest not in ('external','inhouse') then raise exception 'Invalid destination';end if;
   if dest='inhouse' and o.expected_amount_vnd<>0 then raise exception 'Inhouse requires zero-value order';end if;
   select array_agg(distinct value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_input->'inventory_item_ids');
   if coalesce(cardinality(ids),0)=0 then raise exception 'Select inventory items';end if;
   select count(*) into n from public.sales_order_inventory_items where sales_order_inventory_items.order_id=o.id and status<>'released' and inventory_item_id<>all(ids);
   if n+cardinality(ids)>o.quantity then raise exception 'Inventory exceeds order quantity';end if;
   if n>0 and o.fulfillment_destination<>dest then raise exception 'Destination already selected';end if;
   for item_id in select unnest(ids) loop
     select * into item from public.sales_inventory_items where id=item_id for update;
     if not found or item.product_id<>o.product_id then raise exception 'Inventory does not match product';end if;
     if item.status='reserved' and item.reserved_order_ref=o.order_code then continue;end if;
     if item.status<>'available' then raise exception 'Inventory item is not available';end if;
     select * into detail from public.fanpage_inventory_details where inventory_item_id=item.id;
     update public.sales_inventory_items set status='reserved',reserved_order_ref=o.order_code,reserved_at=now(),updated_at=now() where id=item.id;
     insert into public.sales_order_inventory_items(order_id,inventory_item_id,status,inventory_code,page_name,facebook_page_id,reserved_by) values(o.id,item.id,'reserved',item.inventory_code,detail.page_name,detail.facebook_page_id,p_actor)
       on conflict(order_id,inventory_item_id) do update set status='reserved',reserved_by=p_actor,reserved_at=now();
     insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,'reserved','available','reserved',o.order_code,p_actor,p_input->>'reason');
   end loop;
   update public.sales_orders set fulfillment_destination=dest,fulfillment_status='in_progress',updated_at=now() where id=o.id;
 elsif p_action in ('release','release_order','cancel_order') then
   if p_action='cancel_order' and (o.payment_status in ('paid','refunded') or o.fulfillment_status='completed') then raise exception 'Paid or completed order requires reconciliation';end if;
   if nullif(btrim(p_input->>'reason'),'') is null then raise exception 'Release reason required';end if;
   for item in select * from public.sales_inventory_items where reserved_order_ref=o.order_code and status='reserved' order by id for update loop
     update public.sales_inventory_items set status='available',reserved_order_ref=null,reserved_at=null,updated_at=now() where id=item.id;
     update public.sales_order_inventory_items set status='released' where sales_order_inventory_items.order_id=o.id and inventory_item_id=item.id and status='reserved';
     insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,'reservation_released','reserved','available',o.order_code,p_actor,p_input->>'reason');
   end loop;
   if o.fulfillment_status<>'completed' then update public.sales_orders set fulfillment_status='unassigned',updated_at=now() where id=o.id;end if;
   if p_action='cancel_order' then
     update public.sales_orders set payment_status='cancelled',fulfillment_status='cancelled',updated_at=now() where id=o.id;
     update public.sales_invoice_records set invoice_status='cancelled',updated_at=now() where sales_invoice_records.order_id=o.id and invoice_status not in ('issued','aggregated');
   end if;
 elsif p_action='finalize' then
   if o.fulfillment_status='completed' then return jsonb_build_object('ok',true,'duplicate',true);end if;
   if o.payment_status<>'paid' or (o.expected_amount_vnd=0 and o.zero_value_verification_status is distinct from 'verified') then raise exception 'Order payment or verification incomplete';end if;
   select count(*) into n from public.sales_order_inventory_items where sales_order_inventory_items.order_id=o.id and status='reserved';
   if n<>o.quantity then raise exception 'Reserve exactly the order quantity before handover';end if;
   if o.fulfillment_destination='inhouse' and o.expected_amount_vnd<>0 then raise exception 'Inhouse requires verified zero-value order';end if;
   dest:=case when o.fulfillment_destination='inhouse' then 'inhouse_transferred' else 'external_sold' end;
   for item in select * from public.sales_inventory_items where id in (select inventory_item_id from public.sales_order_inventory_items where sales_order_inventory_items.order_id=o.id and status='reserved') order by id for update loop
     if item.status<>'reserved' or item.reserved_order_ref is distinct from o.order_code then raise exception 'Reservation does not match';end if;
     if dest='inhouse_transferred' then
       select * into detail from public.fanpage_inventory_details where inventory_item_id=item.id;page_key:=detail.facebook_page_id;
       if exists(select 1 from public.pages where id=page_key) then raise exception 'Page registry already exists; reconcile ownership before transfer';end if;
       insert into public.pages(id,name,meta_connection,updated_at,registry_source,custody_status) values(page_key,detail.page_name,'sales_inventory',now(),'sales_inventory','intake');
       insert into public.inhouse_page_inventory(inventory_item_id,page_id,transferred_by,note) values(item.id,page_key,p_actor,p_input->>'reason');
     end if;
     update public.sales_inventory_items set status=dest,sold_order_ref=o.order_code,sold_at=now(),reserved_order_ref=null,reserved_at=null,updated_at=now() where id=item.id;
     update public.sales_order_inventory_items set status=dest,finalized_at=now() where sales_order_inventory_items.order_id=o.id and inventory_item_id=item.id;
     insert into public.sales_inventory_ledger(inventory_item_id,action,from_status,to_status,order_ref,actor_user_id,reason) values(item.id,dest,'reserved',dest,o.order_code,p_actor,p_input->>'reason');
   end loop;
   update public.sales_orders set fulfillment_status='completed',updated_at=now() where id=o.id;
 end if;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'sales_fulfillment_'||p_action,'sales_order',o.id,coalesce(p_input,'{}'::jsonb));
 return jsonb_build_object('ok',true,'order_id',o.id);
end; $$;
revoke all on function public.sales_inventory_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inventory_command(text,uuid,jsonb) to service_role;
-- Legacy loose-order-reference writes are no longer an entry point.
revoke execute on function public.sales_reserve_inventory_item(uuid,text,uuid,text),public.sales_release_inventory_reservation(uuid,text,uuid,text),public.sales_finalize_inventory_item(uuid,text,text,uuid,text,text) from service_role;
notify pgrst,'reload schema';

-- Public checkout is server-only: insert order/invoice and reserve FIFO stock together.
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
 if coalesce(cardinality(ids),0)<>q then raise exception 'Insufficient available inventory';end if;
 insert into public.sales_orders(order_code,product_id,buyer_user_id,buyer_name,buyer_phone,buyer_email,fulfillment_profile_url,quantity,unit_price_vnd,gross_amount_vnd,discount_percent,discount_amount_vnd,promo_code,promo_discount_vnd,gift_name,gift_download_url,expected_amount_vnd,payment_reference,payment_expires_at,zero_value_verification_status,fulfillment_status)
 values(p_order->>'order_code',(p_order->>'product_id')::uuid,nullif(p_order->>'buyer_user_id','')::uuid,p_order->>'buyer_name',p_order->>'buyer_phone',p_order->>'buyer_email',p_order->>'fulfillment_profile_url',q,configured,(p_order->>'gross_amount_vnd')::bigint,(p_order->>'discount_percent')::integer,(p_order->>'discount_amount_vnd')::bigint,p_order->>'promo_code',(p_order->>'promo_discount_vnd')::bigint,p_order->>'gift_name',p_order->>'gift_download_url',(p_order->>'expected_amount_vnd')::bigint,p_order->>'payment_reference',nullif(p_order->>'payment_expires_at','')::timestamptz,p_order->>'zero_value_verification_status','in_progress') returning * into o;
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
 return o;
end; $$;
revoke all on function public.sales_checkout_create(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_checkout_create(jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
