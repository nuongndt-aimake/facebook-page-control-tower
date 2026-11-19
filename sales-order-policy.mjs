export function canReadAllSalesOrders(context) {
  return ['platform_admin','super_admin'].includes(context.profile.role) ||
    (Array.isArray(context.profile.permissions?.sales_orders) && context.profile.permissions.sales_orders.includes('read_all'));
}
export function visibleSalesOrders(context, orders, assignments=[]) {
  if(canReadAllSalesOrders(context))return orders;
  const assigned=new Set(assignments.filter(item=>String(item.assignee_user_id)===String(context.user.id)).map(item=>String(item.order_id)));
  return orders.filter(order=>String(order.buyer_user_id)===String(context.user.id)||assigned.has(String(order.id)));
}
