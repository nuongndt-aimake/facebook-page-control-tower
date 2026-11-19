-- Run with BEGIN/ROLLBACK only; every fixture is disposable and removed on rollback.
create temporary table held_import_checks(name text primary key);
do $$
declare a uuid:=gen_random_uuid(); r jsonb; retry jsonb; payload jsonb; failed boolean; before_count bigint; batch text:='qa-held-'||gen_random_uuid();
begin
 insert into auth.users(id,email) values(a,'held-qa-'||a||'@example.invalid');
 insert into public.profiles(id,email,display_name,role,status,permissions) values(a,'held-qa-'||a||'@example.invalid','QA held import','viewer','active','{}') on conflict(id) do update set role='viewer',permissions='{}',status='active';
 payload:='[{"facebook_page_id":"990019230001","page_name":"QA held Page","page_link":"https://www.facebook.com/profile.php?id=990019230002","current_admin_reference":"QA holder"}]';
 failed:=false;begin perform public.sales_import_held_inhouse_batch(a,batch,repeat('a',64),payload);exception when raise_exception then if sqlerrm='Forbidden' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'QA viewer allowed';end if;insert into held_import_checks values('viewer denied');
 update public.profiles set role='operator',permissions='{"sales_inventory":["read","intake","publish","reserve","finalize","assign_inhouse"]}' where id=a;
 select count(*) into before_count from public.sales_inventory_items;
 failed:=false;begin perform public.sales_import_held_inhouse_batch(a,batch,repeat('a',64),payload||jsonb_build_array(jsonb_build_object('facebook_page_id','invalid')));exception when raise_exception then if sqlerrm='Invalid Page information' then failed:=true;else raise;end if;end;
 if not failed or (select count(*) from public.sales_inventory_items)<>before_count then raise exception 'QA rollback failed';end if;insert into held_import_checks values('late validation rolls back intake');
 r:=public.sales_import_held_inhouse_batch(a,batch,repeat('a',64),payload);
 if (r->>'created')::integer<>1 then raise exception 'QA creation failed';end if;insert into held_import_checks values('one item created');
 if not exists(select 1 from public.fanpage_inventory_details d join public.sales_inventory_items i on i.id=d.inventory_item_id join public.inhouse_page_inventory h on h.inventory_item_id=i.id where d.facebook_page_id='990019230001' and d.page_link like '%990019230002' and i.status='inhouse_transferred' and i.purchase_cost_vnd is null and h.status='active') then raise exception 'QA asset mismatch';end if;insert into held_import_checks values('source URL preserved and stock transferred');
 if not exists(select 1 from public.page_assignments where page_id='990019230001' and user_id=a and assignment_role='manager' and status='active') or not exists(select 1 from public.page_access where page_id='990019230001' and user_id=a and access_level='manager') then raise exception 'QA manager missing';end if;insert into held_import_checks values('manager scoped to imported Page');
 if not exists(select 1 from public.sales_orders o join public.sales_order_assignments s on s.order_id=o.id where o.id=(r->'orders'->0->>'order_id')::uuid and o.expected_amount_vnd=0 and o.buyer_user_id=a and s.assignee_user_id=a and o.zero_value_verification_status='verified' and o.fulfillment_status='completed') then raise exception 'QA order mismatch';end if;insert into held_import_checks values('verified zero order owned and assigned');
 retry:=public.sales_import_held_inhouse_batch(a,batch,repeat('a',64),payload);if retry->>'duplicate'<>'true' or retry->'orders'<>r->'orders' then raise exception 'QA retry duplicated';end if;insert into held_import_checks values('retry idempotent');
 failed:=false;begin perform public.sales_import_held_inhouse_batch(a,batch,repeat('b',64),payload);exception when raise_exception then if sqlerrm='Batch identity mismatch' then failed:=true;else raise;end if;end;if not failed then raise exception 'QA hash mismatch allowed';end if;insert into held_import_checks values('hash mismatch rejected');
 if has_function_privilege('anon','public.sales_import_held_inhouse_batch(uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','public.sales_import_held_inhouse_batch(uuid,text,text,jsonb)','execute') then raise exception 'QA public execution enabled';end if;insert into held_import_checks values('public execution denied');
end $$;
select name as passed from held_import_checks order by name;
