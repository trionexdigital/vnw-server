import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBilling, loadBilling } from './billing';
import { Orders } from './orders';
import { Prebooks } from '../prebooks/prebooks';
import { Admin } from '../admin/admin';

const item = { number_id: 7, display_number: '98765 43210', mrp: '1999', offer_price: '999.99', title_label: 'VIP Number', status: 'AVAILABLE', stock: 1, visibility_type: 'ONLINE', rtp_status: 'RTP' };
const coupon = { code: 'SAVE10', is_active: 1, type: 'PERCENT', value: 10, min_order: 500, expires_at: '2030-01-01' };

test('GST is rounded after the offer price and coupon discount; client totals are irrelevant', () => {
  const b = calculateBilling([item], 18, coupon);
  assert.equal(b.subtotal, 999.99); assert.equal(b.discount, 100);
  assert.equal(b.taxable_amount, 899.99); assert.equal(b.gst_amount, 162); assert.equal(b.total, 1061.99);
  assert.equal(b.offer_savings, 999.01);
  assert.equal(calculateBilling([item], 0).total, 999.99);
  assert.equal(calculateBilling([item], 18, { ...coupon, type: 'FLAT', value: 99999 }).total, 0);
});
test('coupon constraints and tax configuration fail with actionable errors', () => {
  assert.throws(() => calculateBilling([item], 101), /GST/);
  assert.throws(() => calculateBilling([item], 18, { ...coupon, min_order: 2000 }), /minimum/);
  assert.throws(() => calculateBilling([item], 18, { ...coupon, expires_at: '2000-01-01' }), /expired/);
  assert.throws(() => calculateBilling([item], 18, { ...coupon, usage_limit: 1, used_count: 1 }), /usage/);
  assert.equal(calculateBilling([item], 18, { ...coupon, expires_at: '2026-09-30' }, new Date('2026-09-30T23:59:00Z')).discount, 100);
});

function connectionFor(number = item) {
  const calls: { sql: string; params: any[] }[] = [];
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema.COLUMNS')) return [[
      ...['mrp_total','offer_savings','taxable_amount','gst_percent','gst_amount','payment_provider','gateway_environment','gateway_order_id','gateway_payment_id','gateway_session_id'].map(COLUMN_NAME => ({ TABLE_NAME: 'orders', COLUMN_NAME })),
      ...['payment_time','payment_completion_time','payment_details','bank_reference','payment_message'].map(COLUMN_NAME => ({ TABLE_NAME: 'payments', COLUMN_NAME })),
      { TABLE_NAME: 'payment_events', COLUMN_NAME: 'event_id' },
    ]];
    if (sql.includes('FROM vip_numbers')) return [[number]];
    if (sql.includes("key_id='GST_PERCENT'")) return [[{ value: '18' }]];
    if (sql.includes('FROM coupons')) return [[coupon]];
    if (sql.includes('FROM auth_user')) return [[{ full_name: 'Customer', email: 'test@example.test', phone: '9876543210' }]];
    if (sql.includes('INSERT INTO orders')) return [{ insertId: 10 }];
    return [{ affectedRows: 1 }];
  } };
  return { calls, connection };
}
test('regular checkout quote does not reserve stock and create stores exactly the quoted billing', async () => {
  const service = new Orders(); const mock = connectionFor();
  (service as any).dao = { getConnection: async () => mock.connection };
  (service as any).prebooks = { reconcile: async () => {} }; service.reconcilePurchases = async () => {};
  const quote: any = await service.quote({ user_id: 1, number_id: 7, coupon_code: 'SAVE10', total: .01 });
  assert.equal(quote.status, 1); assert.equal(quote.data.total, 1061.99);
  assert.ok(mock.calls.every(c => !/^\s*(INSERT|UPDATE|DELETE)/.test(c.sql)));
  const result: any = await service.create({ user_id: 1, number_id: 7, coupon_code: 'SAVE10' });
  assert.equal(result.status, 1); assert.equal(result.data.total, quote.data.total);
  const insert = mock.calls.find(c => c.sql.includes('INSERT INTO orders'))!;
  assert.equal((insert.sql.match(/\?/g) || []).length, insert.params.length);
  assert.equal(insert.params[4], 1061.99); assert.deepEqual(insert.params.slice(-3), [899.99, 18, 162]);
});
test('offline number access and unavailable stock cannot be bypassed by requesting a quote', async () => {
  for (const number of [{ ...item, status: 'SOLD' }, { ...item, visibility_type: 'OFFLINE' }]) {
    const service = new Orders(); const mock = connectionFor(number);
    (service as any).dao = { getConnection: async () => mock.connection };
    assert.equal((await service.quote({ user_id: 1, number_id: 7 })).status, -33);
    assert.ok(mock.calls.every(c => !/^\s*(INSERT|UPDATE)/.test(c.sql)));
  }
});
test('pre-book quote and reserve use the same GST snapshots without changing the refund basis', async () => {
  const service = new Prebooks(); const mock = connectionFor({ ...item, rtp_status: 'NON_RTP', rtp_available_at: '2030-12-01 00:00:00' } as any);
  (service as any).dao = { getConnection: async () => mock.connection }; service.reconcile = async () => {};
  const quote: any = await service.quote({ user_id: 1, number_id: 7 }); assert.equal(quote.status, 1); assert.equal(quote.data.total, 1179.99);
  assert.ok(mock.calls.every(c => !/^\s*(INSERT|UPDATE)/.test(c.sql)));
  const created: any = await service.create({ user_id: 1, number_id: 7 }); assert.equal(created.status, 1); assert.equal(created.data.total, quote.data.total);
  const insert = mock.calls.find(c => c.sql.includes('INSERT INTO orders'))!;
  assert.equal((insert.sql.match(/\?/g) || []).length, insert.params.length);
});
test('only valid GST values reach admin settings writes', async () => {
  const service = new Admin(); (service as any).dao = { getConnection: () => { throw new Error('Unexpected write'); } };
  for (const value of ['-1', '100.01', '18.123', 'abc', '']) {
    const result: any = await service.settingsSave({ GST_PERCENT: value, GLOBAL_NUMBER_DISCOUNT_PERCENT: 0 });
    assert.match(result.info, /GST must/);
  }
});

test('coupon limits include paid orders and active payment holds using a current, bounded read', async () => {
  const calls: string[] = [];
  const connection = { query: async (sql: string) => { calls.push(sql); return sql.includes('FROM env') ? [[{ value: '18' }]] : sql.includes('FROM coupons') ? [[{ ...coupon, usage_limit: 1, used_count: 0 }]] : [[{ order_id: 1 }]]; } };
  await assert.rejects(() => loadBilling(connection, [item], 'SAVE10'), /usage limit/);
  assert.ok(calls.some(sql => sql.includes('LIMIT ? FOR UPDATE')));
  assert.throws(() => calculateBilling([item], 18.123), /GST/);
});
