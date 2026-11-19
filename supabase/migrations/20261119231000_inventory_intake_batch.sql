-- CLI-generated 20261119141822; ordered after inventory dependencies.
create table public.sales_inventory_intake_batches(request_id uuid primary key,actor_user_id uuid not null references auth.users(id),payload_sha256 text not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.sales_inventory_intake_batches enable row level security;
revoke all on public.sales_inventory_intake_batches from public,anon,authenticated;
grant all on public.sales_inventory_intake_batches to service_role;
create function public.sales_inventory_intake_batch(p_actor uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare request_key uuid; digest text; prior public.sales_inventory_intake_batches%rowtype;
 rows jsonb; row_data jsonb; created jsonb:='[]'; response jsonb; product uuid; n integer; idx integer:=0;
begin
 if not public.operations_allowed(p_actor,'sales_inventory','intake') then raise exception 'Forbidden';end if;
 request_key:=(p_input->>'request_id')::uuid;product:=(p_input->>'product_id')::uuid;rows:=p_input->'pages';
 if request_key is null or product is null or jsonb_typeof(rows) is distinct from 'array' then raise exception 'Invalid import batch';end if;
 n:=jsonb_array_length(rows);if n<1 or n>500 then raise exception 'Invalid import size';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('product_id',product,'pages',rows)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('inventory-intake:'||request_key::text,0));
 select * into prior from public.sales_inventory_intake_batches where request_id=request_key;
 if found then
  if prior.actor_user_id<>p_actor or prior.payload_sha256<>digest then raise exception 'Invalid import retry payload';end if;
  return prior.result||jsonb_build_object('duplicate',true);
 end if;
 if (select count(distinct ltrim(btrim(value->>'facebook_page_id'),'0')) from jsonb_array_elements(rows))<>n then raise exception 'Invalid duplicate Page ID in import';end if;
 for row_data in select value from jsonb_array_elements(rows) loop
  idx:=idx+1;
  begin
   response:=public.sales_inventory_command('intake',p_actor,row_data||jsonb_build_object('product_id',product));
  exception when unique_violation then raise exception 'Import row %: Page ID already exists',idx;
   when raise_exception then raise exception 'Invalid import row %: %',idx,sqlerrm;
  end;
  created:=created||jsonb_build_array(jsonb_build_object('inventory_item_id',response->'item'->>'id','inventory_code',response->>'inventory_code','facebook_page_id',row_data->>'facebook_page_id'));
 end loop;
 response:=jsonb_build_object('ok',true,'request_id',request_key,'created',n,'items',created);
 insert into public.sales_inventory_intake_batches(request_id,actor_user_id,payload_sha256,result) values(request_key,p_actor,digest,response);
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'sales_inventory_batch_intake','inventory_import',request_key,jsonb_build_object('created',n,'product_id',product));
 return response;
end $$;
revoke all on function public.sales_inventory_intake_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inventory_intake_batch(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
