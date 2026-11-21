/**
 * Pure delivery aggregate for a Fanpage order.
 *
 * This is deliberately independent from the current database enum. During the
 * transition, legacy item statuses are normalized here; the database migration
 * will persist the explicit delivery states and make the RPC authoritative.
 */
const DELIVERY = new Map([
  ['reserved', 'allocated'],
  ['allocated', 'allocated'],
  ['handover_started', 'handover_started'],
  ['granting', 'handover_started'],
  ['delivered', 'delivered'],
  ['external_sold', 'delivered'],
  ['inhouse_transferred', 'delivered'],
  ['delivery_failed', 'delivery_failed'],
]);

export function normalizeDeliveryState(status) {
  return DELIVERY.get(String(status || '').trim()) || null;
}

export function summarizeOrderDelivery(quantity, orderItems = []) {
  const required = Number(quantity);
  if (!Number.isSafeInteger(required) || required < 1) throw new Error('Invalid required quantity');

  const counts = { allocated: 0, handover_started: 0, delivered: 0, delivery_failed: 0 };
  for (const item of orderItems) {
    const state = normalizeDeliveryState(item?.delivery_state || item?.status);
    if (state) counts[state] += 1;
  }

  const attached = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const debt = Math.max(0, required - attached);
  const outstanding = required - counts.delivered;
  let fulfillmentStatus = 'allocated';

  if (counts.delivered === required && debt === 0) fulfillmentStatus = 'completed';
  else if (counts.delivered > 0) fulfillmentStatus = 'partial_delivered';
  else if (debt > 0) fulfillmentStatus = 'page_debt';
  else if (counts.delivery_failed > 0 && counts.handover_started === 0) fulfillmentStatus = 'failed';
  else if (counts.handover_started > 0) fulfillmentStatus = 'granting';

  return Object.freeze({
    required,
    attached,
    debt,
    outstanding,
    ...counts,
    fulfillmentStatus,
    isComplete: fulfillmentStatus === 'completed',
  });
}
