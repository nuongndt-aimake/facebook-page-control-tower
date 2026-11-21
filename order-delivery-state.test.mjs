import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDeliveryState, summarizeOrderDelivery } from './order-delivery-state.mjs';

test('legacy item states normalize without treating reservation as delivery', () => {
  assert.equal(normalizeDeliveryState('reserved'), 'allocated');
  assert.equal(normalizeDeliveryState('external_sold'), 'delivered');
  assert.equal(normalizeDeliveryState('released'), null);
  assert.equal(normalizeDeliveryState('replaced'), null);
});

test('zero stock and partial allocation remain page debt', () => {
  assert.deepEqual(summarizeOrderDelivery(3, []), {
    required: 3, attached: 0, debt: 3, outstanding: 3,
    allocated: 0, handover_started: 0, delivered: 0, delivery_failed: 0,
    fulfillmentStatus: 'page_debt', isComplete: false,
  });
  assert.equal(summarizeOrderDelivery(3, [{ status: 'reserved' }]).fulfillmentStatus, 'page_debt');
});

test('only delivery evidence for every required Page completes an order', () => {
  assert.equal(summarizeOrderDelivery(2, [{ status: 'reserved' }, { status: 'reserved' }]).fulfillmentStatus, 'allocated');
  assert.equal(summarizeOrderDelivery(2, [{ delivery_state: 'handover_started' }, { status: 'reserved' }]).fulfillmentStatus, 'granting');
  assert.equal(summarizeOrderDelivery(2, [{ delivery_state: 'delivered' }, { status: 'reserved' }]).fulfillmentStatus, 'partial_delivered');
  assert.equal(summarizeOrderDelivery(2, [{ status: 'external_sold' }, { status: 'inhouse_transferred' }]).fulfillmentStatus, 'completed');
});

test('a failed Page cannot make an undelivered order complete', () => {
  const failed = summarizeOrderDelivery(2, [{ delivery_state: 'delivery_failed' }, { status: 'reserved' }]);
  assert.equal(failed.fulfillmentStatus, 'failed');
  assert.equal(failed.isComplete, false);

  const partial = summarizeOrderDelivery(2, [{ delivery_state: 'delivered' }, { delivery_state: 'delivery_failed' }]);
  assert.equal(partial.fulfillmentStatus, 'partial_delivered');
  assert.equal(partial.isComplete, false);
});

test('invalid required quantity is rejected before any aggregate is inferred', () => {
  assert.throws(() => summarizeOrderDelivery(0, []), /Invalid required quantity/);
  assert.throws(() => summarizeOrderDelivery(1.5, []), /Invalid required quantity/);
});
