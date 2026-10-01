import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import axios from 'axios';
import express from 'express';
import supertest from 'supertest';
import { MySqlClient } from '../../../gen_db/database';
import { PaymentHistory, safePaymentData, assertCheckoutSchema, PAYMENT_SCHEMA_MESSAGE } from './paymentHistory';
import { paymentFilters, PaymentAnalysis } from './paymentAnalysis';
import { CashfreeClient } from './cashfree';
import { calculateBilling } from '../orders/billing';
import { Orders } from '../orders/orders';
import { Prebooks } from '../prebooks/prebooks';
import adminRoutes from '../admin/admin.routes';
import { Admin } from '../admin/admin';

// Fail closed on any unexpected real DB access in this suite.
(MySqlClient.prototype as any).executeQuery = async () => { throw new Error('Unexpected database access in test'); };
(MySqlClient.prototype as any).getConnection = async () => { throw new Error('Unexpected database access in test'); };
const fields = ['orders.mrp_total','orders.offer_savings','orders.taxable_amount','orders.gst_percent','orders.gst_amount',
  'orders.payment_provider','orders.gateway_environment','orders.gateway_order_id','orders.gateway_payment_id','orders.gateway_session_id',
  'payments.payment_time','payments.payment_completion_time','payments.payment_details','payments.bank_reference','payments.payment_message','payment_events.event_id'];
const schema = () => fields.map((f) => ({ TABLE_NAME: f.split('.')[0], COLUMN_NAME: f.split('.')[1] }));

test('missing billing columns block both checkouts before inventory is reserved', async () => {
  for (const service of [new Orders(), new Prebooks()]) {
    const queries: string[] = []; let began = false;
    (service as any).dao = { executeQuery: async () => ({ status: 1, rows: [] }), getConnection: async () => ({
      query: async (sql: string) => { queries.push(sql); return [schema().filter((r) => r.COLUMN_NAME !== 'mrp_total')]; },
      beginTransaction: async () => { began = true; }, rollback: async () => {}, release: () => {},
    }) };
    const response = await service.create({ user_id: 1, number_id: 7 });
    assert.equal(response.status, -33); assert.ok(response.info.includes(PAYMENT_SCHEMA_MESSAGE));
    assert.equal(began, false); assert.equal(queries.length, 1); assert.ok(queries[0].includes('information_schema'));
  }
});

test('complete schema permits checkout; gateway history is required as well as tax columns', async () => {
  await assertCheckoutSchema({ query: async () => [schema()] });
  await assert.rejects(assertCheckoutSchema({ query: async () => [schema().filter((r) => r.TABLE_NAME !== 'payment_events')] }), /database update required/);
});

test('the reported checkout amount stores its exact server-calculated billing breakdown', () => {
  assert.deepEqual(calculateBilling([{ mrp: 33999, offer_price: 16999.50 }], 18), {
    mrp_total: 33999, offer_savings: 16999.5, subtotal: 16999.5, discount: 0, taxable_amount: 16999.5,
    gst_percent: 18, gst_amount: 3059.91, total: 20059.41, coupon_code: null,
  });
});

test('checkout stores the full billing snapshot and its event in the inventory transaction', async () => {
  const service: any = new Orders(); service.prebooks = { reconcile: async () => {} }; service.reconcilePurchases = async () => {};
  const writes: any[] = []; let committed = false; let eventStored = false;
  const item = { number_id: 7, display_number: '9161 551 551', mrp: 33999, offer_price: 16999.5, seller_type: 'ADMIN', seller_id: 1, status: 'AVAILABLE', stock: 1, rtp_status: 'RTP', visibility_type: 'ONLINE' };
  service.dao = { getConnection: async () => ({ beginTransaction: async () => {}, rollback: async () => {}, release: () => {},
    commit: async () => { assert.ok(eventStored); committed = true; }, query: async (sql: string, params: any[] = []) => {
      if (sql.includes('information_schema')) return [schema()];
      if (sql.includes('FROM vip_numbers')) return [[item]];
      if (sql.includes('FROM env')) return [[{ value: '18' }]];
      if (sql.includes('FROM auth_user')) return [[{ full_name: 'Buyer', email: 'buyer@example.test', phone: '9999999999' }]];
      assert.equal((sql.match(/\?/g) || []).length, params.length); writes.push({ sql, params });
      if (sql.startsWith('INSERT INTO payment_events')) eventStored = true;
      return [{ insertId: 7, affectedRows: 1 }];
    } }) };
  const response = await service.create({ user_id: 3, number_id: 7 });
  assert.equal(response.status, 1); assert.equal(response.data.total, 20059.41); assert.ok(committed);
  const insert = writes.find((write) => write.sql.startsWith('INSERT INTO orders'));
  assert.deepEqual(insert.params.slice(-5), [33999,16999.5,16999.5,18,3059.91]);
});

test('admin status changes cannot fabricate payment or refund confirmation', async () => {
  for (const status of ['PAID','COMPLETED','REFUNDED']) {
    const service: any = new Admin(); let writes = 0;
    service.dao = { getConnection: async () => ({ beginTransaction: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string) => {
      if (sql.startsWith('SELECT')) return [[{ order_id: 7, order_type: 'PURCHASE', status: 'PENDING', payment_status: 'UNPAID' }]];
      writes++; return [{}];
    } }) };
    const response = await service.orderUpdateStatus({ order_id: 7, status, user_id: 1 });
    assert.equal(response.status, -33); assert.match(response.info, /verified/); assert.equal(writes, 0);
  }
});

test('recursive redaction excludes secrets, authentication and sessions while masking payment instruments', () => {
  const data = safePaymentData({ payment_session_id: 'session-secret', signature: 'signature-secret', headers: { 'x-client-secret': 'api-secret', Authorization: 'auth-secret' },
    payment_method: { card: { card_number: '4111111111111111', cvv: '987', card_network: 'VISA' }, upi: { upi_id: 'buyer@bank' } }, payment_status: 'SUCCESS' });
  const text = JSON.stringify(data);
  for (const secret of ['session-secret','signature-secret','api-secret','auth-secret','4111111111111111','987','buyer@bank']) assert.ok(!text.includes(secret));
  assert.equal(data.payment_method.card.card_number, '***1111'); assert.equal(data.payment_method.card.card_network, 'VISA'); assert.equal(data.payment_status, 'SUCCESS');
});

test('business events are deduplicated and use the same transaction as the business mutation', async () => {
  const calls: any[] = [];
  const history = new PaymentHistory({ executeQuery: async () => { throw new Error('Must use transaction'); } });
  const connection = { query: async (sql: string, params: any[]) => { calls.push({ sql, params }); } };
  for (let i=0;i<2;i++) await history.event({ order_id: 7, environment: 'sandbox' }, 'ORDER_PAID', 'PAID', { total: 20059.41 }, 'SERVER', connection, 'paid:7');
  assert.equal(calls[0].params[11], calls[1].params[11]); assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE event_id=event_id/);
  assert.equal((calls[0].sql.match(/\?/g) || []).length, calls[0].params.length);
});

test('the gateway cannot be contacted if request intent cannot be stored', async () => {
  const request = axios.request; const app = process.env.CASHFREE_APP_ID; const secret = process.env.CASHFREE_SECRET_KEY; let contacted = false;
  try {
    process.env.CASHFREE_APP_ID = 'TEST-fixture'; process.env.CASHFREE_SECRET_KEY = 'fixture-secret';
    axios.request = (async () => { contacted = true; return { data: {} }; }) as any;
    const client = new CashfreeClient({ order_id: 7 }, new PaymentHistory({ executeQuery: async () => ({ status: -1 }) }));
    await assert.rejects(client.createOrder({ order_id: 'vnw_test' }), /database update required/); assert.equal(contacted, false);
  } finally { axios.request = request; if (app === undefined) delete process.env.CASHFREE_APP_ID; else process.env.CASHFREE_APP_ID = app; if (secret === undefined) delete process.env.CASHFREE_SECRET_KEY; else process.env.CASHFREE_SECRET_KEY = secret; }
});

test('gateway response history records success without persisting a checkout session', async () => {
  const request = axios.request; const app = process.env.CASHFREE_APP_ID; const secret = process.env.CASHFREE_SECRET_KEY; const rows: any[] = [];
  try {
    process.env.CASHFREE_APP_ID = 'TEST-fixture'; process.env.CASHFREE_SECRET_KEY = 'fixture-secret';
    axios.request = (async () => ({ status: 200, data: { payment_session_id: 'sensitive-session', order_id: 'vnw_test', order_status: 'ACTIVE' } })) as any;
    const client = new CashfreeClient({ order_id: 7 }, new PaymentHistory({ executeQuery: async (_sql: string, params: any[]) => { rows.push(params); return { status: 1 }; } }));
    const result = await client.getOrder('vnw_test'); assert.equal(result.payment_session_id, 'sensitive-session');
    assert.equal(rows.length, 2); assert.equal(rows[0][10], rows[1][10]); assert.ok(!JSON.stringify(rows).includes('sensitive-session')); assert.ok(!JSON.stringify(rows).includes('fixture-secret'));
  } finally { axios.request = request; if (app === undefined) delete process.env.CASHFREE_APP_ID; else process.env.CASHFREE_APP_ID = app; if (secret === undefined) delete process.env.CASHFREE_SECRET_KEY; else process.env.CASHFREE_SECRET_KEY = secret; }
});

test('analysis dates respect IST inclusive days and all filters are parameterized', () => {
  const filter = paymentFilters({ environment: 'sandbox', from: '2026-10-01', to: '2026-10-01', q: "' OR 1=1 --" });
  assert.equal(filter.params[1], '2026-09-30 18:30:00'); assert.equal(filter.params[2], '2026-10-01 18:30:00'); assert.ok(!filter.where.includes('1=1'));
  assert.throws(() => paymentFilters({ environment: 'all' })); assert.throws(() => paymentFilters({ from: '2026-02-30' }));
});

test('analysis totals use payment attempts and processed refunds without inflating them through joins', async () => {
  const service: any = new PaymentAnalysis(); const calls: any[] = [];
  service.dao = { executeQuery: async (sql: string, params: any[]) => { calls.push({ sql, params }); return { status: 1, rows:
    sql.includes('AS paid_orders') && sql.includes('AS total') ? [{ total: 2, paid_orders: 1 }]
    : sql.includes('AS successful_attempts') ? [{ captured: 20059.41, attempts: 2 }]
    : sql.includes('AS refund_pending') ? [{ refunded: 100, refund_pending: 0 }] : [] }; } };
  const response = await service.overview({ environment: 'sandbox' });
  assert.equal(response.status, 1); assert.equal(response.data.stats.net_captured, 19959.41); assert.equal(response.data.total, 2);
  assert.ok(calls.every((c) => c.params[0] === 'sandbox')); assert.ok(calls.find((c) => c.sql.includes('AS successful_attempts')).sql.includes("p.status IN ('SUCCESS','REVIEW')"));
});

test('admin detail excludes checkout sessions and old signatures and sanitizes retained gateway payloads', async () => {
  const service: any = new PaymentAnalysis();
  service.dao = { executeQuery: async (sql: string) => ({ status: 1, rows: sql.startsWith('SELECT * FROM orders') ? [{ order_id: 7, gateway_environment: 'sandbox', gateway_order_id: 'vnw_7', gateway_session_id: 'secret-session', legacy_signature: 'old-signature', total: 20059.41 }]
    : sql.startsWith('SELECT * FROM payments') ? [{ payment_id: 1, raw_payload: JSON.stringify({ payment_status: 'SUCCESS', cvv: 'sensitive-cvv', card_number: '4111111111111111' }) }]
    : [] }) };
  const response = await service.detail({ order_id: 7 }); const text = JSON.stringify(response.data);
  assert.equal(response.status, 1);
  for (const secret of ['secret-session','old-signature','sensitive-cvv','4111111111111111']) assert.ok(!text.includes(secret));
  assert.equal(response.data.order.total, 20059.41); assert.equal(response.data.attempts[0].raw_payload.card_number, '***1111');
});

test('payment analysis and reconciliation routes reject every non-admin, including spoofed client roles', async () => {
  const execute = MySqlClient.prototype.executeQuery; let reads = 0; let finance = 0;
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { (req as any).authUserId = 5; next(); }); app.use('/admin', adminRoutes);
  try {
    (MySqlClient.prototype as any).executeQuery = async (sql: string) => { if (sql.includes('SELECT role FROM auth_user')) { reads++; return { status: 1, rows: [{ role: 'EMPLOYEE' }] }; } finance++; throw new Error('Must not access payment tables'); };
    for (const path of ['overview','detail','reconcile']) {
      const response = await supertest(app).post(`/admin/payments/${path}`).send({ role: 'ADMIN', user_id: 1, order_id: 7 });
      assert.equal(response.body.status, -9); assert.match(response.body.info, /Forbidden/);
    }
    assert.equal(reads, 3); assert.equal(finance, 0);
  } finally { MySqlClient.prototype.executeQuery = execute; }
});

test('the manual migration repairs billing and preserves historical amounts without an automatic runner', () => {
  const sql = fs.readFileSync('database/migrations/20261001_payment_history_checkout_sqlyog.sql','utf8');
  for (const column of ['mrp_total','offer_savings','taxable_amount','gst_percent','gst_amount','payment_time','payment_completion_time','payment_details']) assert.ok(sql.includes(`ADD COLUMN ${column}`));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS `payment_events`')); assert.ok(sql.includes('information_schema.COLUMNS'));
  assert.ok(!/UPDATE\s+orders\s+SET\s+(total|subtotal|gst_amount)/i.test(sql)); assert.ok(!/DELETE FROM|DROP TABLE/i.test(sql));
});
