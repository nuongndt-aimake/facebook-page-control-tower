-- Run with BEGIN/ROLLBACK only; requires 20261121050200_authorization_branch_fulfillment_foundation.sql.
create temporary table authorization_branch_checks(label text primary key);
do $$
declare p uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); branch uuid;
begin
  select id into branch from public.product_branches where code='FANPAGE_LEGACY';
  if branch is null then raise exception 'QA legacy branch missing'; end if;
  insert into public.sales_products(id,sku,name,unit_price_vnd,status,product_group,product_branch_id)
  values(p,'QA-BRANCH-'||replace(p::text,'-',''),'QA Branch product',100000,'active','fanpage',branch);
  insert into public.sales_inventory_items(id,product_id,product_branch_id,inventory_code,status)
  values(i,p,branch,'QA-BRANCH-'||replace(i::text,'-',''),'draft');
  insert into public.sales_orders(id,order_code,product_id,product_branch_id,buyer_name,buyer_phone,buyer_email,quantity,unit_price_vnd,gross_amount_vnd,discount_percent,discount_amount_vnd,expected_amount_vnd,payment_reference)
  values(o,'FS'||upper(substr(replace(o::text,'-',''),1,10)),p,branch,'QA buyer','0900000000','qa@example.invalid',1,100000,100000,0,0,100000,'QA-'||replace(o::text,'-',''));
  insert into authorization_branch_checks values('fanpage product, inventory and order accept an explicit branch');
  if exists(select 1 from public.sales_products where id=p and product_branch_id is null)
    or exists(select 1 from public.sales_inventory_items where id=i and product_branch_id is null)
    or exists(select 1 from public.sales_orders where id=o and product_branch_id is null) then raise exception 'QA branch snapshot missing'; end if;
  insert into authorization_branch_checks values('branch snapshots are preserved per product, item and order');
  if has_table_privilege('authenticated','public.product_branches','select') or has_table_privilege('authenticated','public.authorization_grants','select') then raise exception 'QA client table grant enabled'; end if;
  insert into authorization_branch_checks values('client cannot read branch or grant tables directly');
end $$;
select label as passed from authorization_branch_checks order by label;
