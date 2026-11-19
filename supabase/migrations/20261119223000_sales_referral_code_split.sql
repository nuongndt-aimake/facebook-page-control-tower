-- CLI-generated migration; checkout keeps separate referral and promotion snapshots.
alter table public.sales_discount_tiers drop constraint if exists sales_discount_tiers_product_type_min_quantity_key;
alter table public.sales_discount_tiers add column if not exists created_by uuid references auth.users(id);
create unique index if not exists sales_discount_tier_version_idx on public.sales_discount_tiers(product_type,min_quantity,effective_from);
create function public.sales_discount_tier_schedule(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare qty integer;percent integer;starts timestamptz;ends timestamptz;kind text;new_row public.sales_discount_tiers%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('platform_admin','super_admin')) then raise exception 'Forbidden';end if;
 qty:=(p_input->>'min_quantity')::integer;percent:=(p_input->>'discount_percent')::integer;kind:=p_input->>'product_type';starts:=(p_input->>'effective_from')::timestamptz;ends:=nullif(p_input->>'effective_until','')::timestamptz;
 if qty is null or qty<1 or qty>100 or percent is null or percent<0 or percent>100 or starts is null or ends<=starts or not exists(select 1 from public.sales_products where product_type=kind) then raise exception 'Invalid discount schedule';end if;
 perform pg_advisory_xact_lock(hashtextextended('discount:'||kind||':'||qty,0));
 update public.sales_discount_tiers set effective_until=starts,updated_at=now() where product_type=kind and min_quantity=qty and effective_from<starts and (effective_until is null or effective_until>starts);
 update public.sales_discount_tiers set effective_until=effective_from,updated_at=now() where product_type=kind and min_quantity=qty and created_by is null and effective_from>=starts and effective_until is null;
 insert into public.sales_discount_tiers(product_type,min_quantity,discount_percent,effective_from,effective_until,created_by) values(kind,qty,percent,starts,ends,p_actor) returning * into new_row;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'schedule_discount_tier','sales_discount_tier',new_row.id,to_jsonb(new_row));return to_jsonb(new_row);
end $$;
revoke all on function public.sales_discount_tier_schedule(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_discount_tier_schedule(uuid,jsonb) to service_role;
alter table public.sales_orders add column if not exists referral_code text;
-- Explicitly requested default internal code; creating a zero order still requires staff + finalize capability on the server.
insert into public.sales_promo_codes(code,code_type,discount_type,discount_value,is_active) values('INHOUSE','promotion','percent',100,true) on conflict(code) do nothing;
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
 return o;
end; $$;
notify pgrst,'reload schema';
