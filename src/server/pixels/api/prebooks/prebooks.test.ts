import test from 'node:test';
import assert from 'node:assert/strict';
import { isCancellationEligible, istDateToUtc, Prebooks } from './prebooks';
import { CATEGORY_CLASSIFIER_VERSION } from '../categories/categoryClassifier';

test('converts India midnight to the matching UTC instant', () => {
  assert.equal(istDateToUtc('2026-08-15'), '2026-08-14 18:30:00');
});

test('rejects malformed RTP dates', () => {
  assert.throws(() => istDateToUtc('15/08/2026'), /valid RTP availability date/);
});

test('48-hour cancellation is eligible through the exact boundary only', () => {
  const deadline = '2026-08-05 10:00:00';
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T09:59:59.999Z')), true);
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T10:00:00.000Z')), true);
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T10:00:00.001Z')), false);
});

test('reservation history includes category evidence for consistent number spacing', async () => {
  const prebooks = new Prebooks();
  (prebooks as any).reconcile = async () => undefined;
  (prebooks as any).dao = { executeQuery: async () => ({ rows: [{
    prebook_id: 1, number_id: 7, number_value: '8008005413', display_number: '8008005413',
    status: 'BOOKED', cancellation_deadline: '2099-01-01 00:00:00',
  }] }) };
  const response: any = await prebooks.my({ user_id: 1 });
  assert.equal(response.status, 1);
  assert.equal(response.data[0].primary_category?.slug, 'doublling-aabbcc');
  assert.ok(Array.isArray(response.data[0].primary_category?.match_spans));
  assert.equal(response.data[0].can_cancel, true);
  assert.equal(response.data[0].number_value, '8008005413');
});

test('pre-book filters validate the parent and scope the child with other filters', async () => {
  const prebooks = new Prebooks();
  (prebooks as any).reconcile = async () => undefined;
  const calls: Array<{ sql: string; params: any[] }> = [];
  (prebooks as any).dao = { executeQuery: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [] };
  } };
  const invalid: any = await prebooks.catalog({ category: 'customer-care-numbers', subcategory_id: 63 });
  assert.equal(invalid.status, -33);
  assert.equal(calls.length, 0);
  const valid: any = await prebooks.catalog({ category: 'customer-care-numbers', subcategory_id: 104, price_min: 1500, page: 2, limit: 12 });
  assert.equal(valid.status, 1);
  assert.match(calls[0].sql, /vip_number_subcategories/);
  assert.ok(calls[0].params.includes(CATEGORY_CLASSIFIER_VERSION));
  assert.ok(calls[0].params.includes(1500));
  assert.deepEqual(calls[1].params.slice(-2), [12, 12]);
});
