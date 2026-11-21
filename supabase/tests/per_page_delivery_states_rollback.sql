-- Run inside a transaction against local/staging only, then ROLLBACK.
-- Preconditions: C-04 branch foundation and the existing sales inventory
-- migrations are present. Never use this script as a production data test.
begin;

do $$
declare
  qa_order_id uuid;
  item_a uuid;
  result jsonb;
begin
  select id into qa_order_id from public.sales_orders order by created_at desc limit 1;
  if qa_order_id is null then
    raise exception 'QA prerequisite missing: create fixture order through test setup';
  end if;

  select inventory_item_id into item_a from public.sales_order_inventory_items
    where order_id = qa_order_id order by reserved_at nulls last limit 1;
  if item_a is null then
    raise exception 'QA prerequisite missing: attach fixture inventory item';
  end if;

  update public.sales_order_inventory_items
  set delivery_state = 'delivered'
  where order_id = qa_order_id and inventory_item_id = item_a;

  select public.sales_order_delivery_summary(qa_order_id) into result;
  if result->>'fulfillment_status' = 'completed'
    and (result->>'delivered')::integer < (result->>'required')::integer then
    raise exception 'C-05 invariant failed: incomplete delivery marked completed';
  end if;

  if has_function_privilege('authenticated', 'public.sales_order_delivery_summary(uuid)', 'EXECUTE') then
    raise exception 'C-05 security failed: authenticated may call delivery summary';
  end if;
end $$;

rollback;
