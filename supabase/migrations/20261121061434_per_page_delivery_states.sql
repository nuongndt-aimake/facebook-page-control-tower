-- C-05 Pha B foundation. Additive only: do not change legacy RPC behavior in
-- this migration. The API/UI cutover is allowed only after rollback testing.
-- Existing order item states stay valid for backwards compatibility.

alter table public.sales_order_inventory_items
  add column if not exists delivery_state text,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_failed_at timestamptz,
  add column if not exists delivery_note text,
  add column if not exists delivery_evidence_ref text,
  add column if not exists delivery_updated_by uuid references auth.users(id);

alter table public.sales_order_inventory_items
  drop constraint if exists sales_order_inventory_items_delivery_state_check;
alter table public.sales_order_inventory_items
  add constraint sales_order_inventory_items_delivery_state_check
  check (delivery_state is null or delivery_state in ('allocated','handover_started','delivered','delivery_failed'));

-- Stable backfill for existing rows. It is safe to re-run and deliberately
-- does not infer a delivery timestamp or an actor from historical status.
update public.sales_order_inventory_items
set delivery_state = case
  when status in ('external_sold','inhouse_transferred') then 'delivered'
  when status = 'reserved' then 'allocated'
  else delivery_state
end
where delivery_state is null
  and status in ('reserved','external_sold','inhouse_transferred');

create index if not exists sales_order_inventory_delivery_idx
  on public.sales_order_inventory_items(order_id, delivery_state, inventory_item_id);

-- Server-only summary used by the future delivery command. No client role is
-- granted execution; it is a read model, not an authorization decision.
create or replace function public.sales_order_delivery_summary(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with order_row as (
    select quantity from public.sales_orders where id = p_order_id
  ), states as (
    select coalesce(delivery_state,
      case when status in ('external_sold','inhouse_transferred') then 'delivered'
           when status = 'reserved' then 'allocated' end) as delivery_state
    from public.sales_order_inventory_items
    where order_id = p_order_id
      and status not in ('released','replaced')
  ), counts as (
    select
      count(*) filter (where delivery_state in ('allocated','handover_started','delivered','delivery_failed'))::integer as attached,
      count(*) filter (where delivery_state = 'allocated')::integer as allocated,
      count(*) filter (where delivery_state = 'handover_started')::integer as handover_started,
      count(*) filter (where delivery_state = 'delivered')::integer as delivered,
      count(*) filter (where delivery_state = 'delivery_failed')::integer as delivery_failed
    from states
  )
  select jsonb_build_object(
    'required', o.quantity,
    'attached', c.attached,
    'debt', greatest(o.quantity - c.attached, 0),
    'outstanding', greatest(o.quantity - c.delivered, 0),
    'allocated', c.allocated,
    'handover_started', c.handover_started,
    'delivered', c.delivered,
    'delivery_failed', c.delivery_failed,
    'fulfillment_status', case
      when c.delivered = o.quantity then 'completed'
      when c.delivered > 0 then 'partial_delivered'
      when c.attached < o.quantity then 'page_debt'
      when c.delivery_failed > 0 and c.handover_started = 0 then 'failed'
      when c.handover_started > 0 then 'granting'
      else 'allocated'
    end
  )
  from order_row o cross join counts c;
$$;

revoke all on function public.sales_order_delivery_summary(uuid) from public, anon, authenticated;
grant execute on function public.sales_order_delivery_summary(uuid) to service_role;

comment on column public.sales_order_inventory_items.delivery_state is
  'C-05 delivery evidence state. Legacy status remains until API/UI cutover; completed must be derived from every required Page delivered.';
comment on function public.sales_order_delivery_summary(uuid) is
  'Service-only C-05 aggregate; does not grant authorization or mutate inventory.';

notify pgrst, 'reload schema';
