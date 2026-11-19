-- CLI-generated at 20261119100547, ordered after the 193000 foundation dependency.
-- Additive repair: one transaction owns event, order and invoice updates.
alter table public.fanpage_inventory_details add column if not exists page_name text;

create or replace function public.sales_process_payment_event(
  p_provider_event_id text,p_reference text,p_amount bigint,p_transfer_type text,p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_event uuid; v_order public.sales_orders%rowtype; v_status text; v_invoice_status text;
begin
  if nullif(trim(p_provider_event_id),'') is null or p_amount is null or p_amount<0 then
    raise exception 'Invalid payment event';
  end if;
  insert into public.sales_payment_events(provider_event_id,amount_vnd,processing_status,raw_payload)
  values(p_provider_event_id,p_amount,'unmatched',coalesce(p_payload,'{}'::jsonb))
  on conflict(provider_event_id) do nothing returning id into v_event;
  if v_event is null then
    return jsonb_build_object('success',true,'duplicate',true,'processing_status','duplicate');
  end if;
  select * into v_order from public.sales_orders where payment_reference=p_reference for update;
  v_status:=case
    when p_transfer_type is distinct from 'in' then 'rejected'
    when v_order.id is null then 'unmatched'
    when v_order.payment_status='paid' then 'duplicate'
    when v_order.payment_status in ('cancelled','refunded') then 'rejected'
    when v_order.payment_expires_at is not null and v_order.payment_expires_at<now() then 'expired'
    when p_amount<>v_order.expected_amount_vnd then 'amount_mismatch'
    else 'processed' end;
  update public.sales_payment_events set order_id=v_order.id,processing_status=v_status where id=v_event;
  if v_order.id is not null and v_status in ('processed','expired','amount_mismatch') then
    update public.sales_orders set payment_status=case when v_status='processed' then 'paid' else 'reconciliation_required' end,
      paid_at=case when v_status='processed' then now() else paid_at end,updated_at=now() where id=v_order.id;
    update public.sales_invoice_records set invoice_status=case when v_status<>'processed' then 'pending_payment'
      when invoice_type='individual' then 'ready_to_issue' else 'aggregate_pending' end,updated_at=now()
      where order_id=v_order.id and invoice_status not in ('issued','aggregated');
  end if;
  return jsonb_build_object('success',true,'duplicate',v_status='duplicate','processing_status',v_status);
end; $$;
revoke all on function public.sales_process_payment_event(text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_process_payment_event(text,text,bigint,text,jsonb) to service_role;
notify pgrst,'reload schema';
