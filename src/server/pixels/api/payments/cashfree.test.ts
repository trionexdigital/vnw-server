import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import axios from 'axios';
import { CashfreeClient, CashfreeError, PaymentHoldError, assertCashfreeOrder, assertCashfreePayment, cashfreeIdempotency, cashfreeOrderMeta, verifyCashfreeSignature } from './cashfree';
import { Payments } from './payments';
import { Prebooks } from '../prebooks/prebooks';
import { Orders } from '../orders/orders';
import express from 'express';
import supertest from 'supertest';
import { router as common } from '../../../middleware/common.middleware';
import { router as auth } from '../../../middleware/auth.middleware';
import paymentRoutes from './payments.routes';
import { MySqlClient } from '../../../gen_db/database';
// The test suite never connects to the deployed database.
(MySqlClient.prototype as any).executeQuery = async (sql: string) => {
  if (sql.startsWith('INSERT INTO payment_events')) return { status: 1, affectedRows: 1 };
  throw new Error(`Unexpected database access in payment test: ${sql.slice(0, 40)}`);
};
const schemaRows = ['orders.mrp_total','orders.offer_savings','orders.taxable_amount','orders.gst_percent','orders.gst_amount',
  'orders.payment_provider','orders.gateway_environment','orders.gateway_order_id','orders.gateway_payment_id','orders.gateway_session_id',
  'payments.payment_time','payments.payment_completion_time','payments.payment_details','payments.bank_reference','payments.payment_message','payment_events.event_id']
  .map((field) => ({ TABLE_NAME: field.split('.')[0], COLUMN_NAME: field.split('.')[1] }));

process.env.CASHFREE_ENV = 'sandbox';
const originalSecret = process.env.CASHFREE_SECRET_KEY;
const order = () => ({ order_id: 7, order_no: 'VNW-TEST', user_id: 3, total: 399.50, order_type: 'PURCHASE', status: 'PENDING', payment_status: 'UNPAID', payment_provider: 'CASHFREE', gateway_environment: 'sandbox', gateway_order_id: 'vnw_sb_TEST', payment_expires_at: '2099-01-01 00:00:00' });
const remote = (o: any) => ({ order_id: o.gateway_order_id, order_currency: 'INR', order_amount: o.total, order_status: 'PAID' });
const payment = () => ({ cf_payment_id: '5007', payment_currency: 'INR', payment_amount: 399.50, payment_status: 'SUCCESS', payment_time: '2026-10-01T10:00:00+05:30' });
function fixture() {
  const service: any = new Payments(); const local = order();
  const writes: any[] = []; let finalizations = 0; let releases = 0;
  service.dao = { executeQuery: async (sql: string, params: any[]) => {
    if (sql.startsWith('SELECT')) return { status: 1, rows: params[1] === 99 ? [] : [local] };
    writes.push({ sql, params }); return { status: 1, affectedRows: 1 };
  } };
  service.gateway = { getOrder: async () => remote(local), getPayments: async () => [payment()] };
  service.orders = { finalizePaid: async () => { finalizations++; local.payment_status = 'PAID'; return local; }, failPurchase: async () => { releases++; } };
  service.prebooks = { finalizePaid: async () => { finalizations++; local.payment_status = 'PAID'; return local; }, failPending: async () => { releases++; } };
  return { service, local, writes, finalizations: () => finalizations, releases: () => releases };
}

test('webhook HMAC uses the original body, including whitespace and decimal formatting', () => {
  const raw = '{ "amount": 399.50 }'; const time = '1790820000000';
  const signature = crypto.createHmac('sha256', 'test-secret').update(time + raw).digest('base64');
  assert.equal(verifyCashfreeSignature(raw, signature, time, 'test-secret'), true);
  assert.equal(verifyCashfreeSignature(JSON.stringify(JSON.parse(raw)), signature, time, 'test-secret'), false);
  for (const bad of ['', 'bad', signature.slice(1)]) assert.equal(verifyCashfreeSignature(raw, bad, time, 'test-secret'), false);
  assert.equal(verifyCashfreeSignature(raw, signature, time, ''), false);
  assert.equal(verifyCashfreeSignature(raw, signature, 'not-a-timestamp', 'test-secret'), false);
});

test('idempotency key is a stable UUID scoped to the operation', () => {
  const id = cashfreeIdempotency('sandbox:order:1');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, cashfreeIdempotency('sandbox:order:1'));
  assert.notEqual(id, cashfreeIdempotency('sandbox:refund:1'));
});

test('amount, currency, successful status and order binding are mandatory', () => {
  const o = order(); assert.doesNotThrow(() => assertCashfreeOrder(o, remote(o)));
  assert.doesNotThrow(() => assertCashfreePayment(o, payment()));
  for (const fields of [{ order_id: 'other' }, { order_amount: 399 }, { order_currency: 'USD' }]) assert.throws(() => assertCashfreeOrder(o, { ...remote(o), ...fields }));
  for (const fields of [{ payment_amount: 1 }, { payment_currency: 'USD' }, { payment_status: 'PENDING' }, { cf_payment_id: null }, { order_id: 'other' }]) assert.throws(() => assertCashfreePayment(o, { ...payment(), ...fields }));
});

test('return and webhook URLs come only from server configuration', () => {
  const base = process.env.CASHFREE_RETURN_BASE_URL; const hook = process.env.CASHFREE_WEBHOOK_URL;
  try {
    process.env.CASHFREE_RETURN_BASE_URL = 'https://store.example'; process.env.CASHFREE_WEBHOOK_URL = 'https://api.example/vipnumberworld/payments/cashfree/webhook';
    assert.equal(cashfreeOrderMeta(7).return_url, 'https://store.example/payments/return?order_id=7');
    process.env.CASHFREE_RETURN_BASE_URL = 'https://user:password@store.example'; assert.throws(() => cashfreeOrderMeta(7));
  } finally { if (base === undefined) delete process.env.CASHFREE_RETURN_BASE_URL; else process.env.CASHFREE_RETURN_BASE_URL = base; if (hook === undefined) delete process.env.CASHFREE_WEBHOOK_URL; else process.env.CASHFREE_WEBHOOK_URL = hook; }
});

test('Axios errors cannot expose credentials or provider request headers', async () => {
  const request = axios.request; const app = process.env.CASHFREE_APP_ID; const secret = process.env.CASHFREE_SECRET_KEY;
  try {
    process.env.CASHFREE_APP_ID = 'TEST-fixture'; process.env.CASHFREE_SECRET_KEY = 'private-test-secret';
    axios.request = (async () => { throw { response: { status: 401 }, config: { headers: { secret: 'private-test-secret' } } }; }) as any;
    await assert.rejects(new CashfreeClient().getOrder('test'), (error: any) => error instanceof CashfreeError && !JSON.stringify(error).includes('private-test-secret'));
  } finally { axios.request = request; if (app === undefined) delete process.env.CASHFREE_APP_ID; else process.env.CASHFREE_APP_ID = app; if (secret === undefined) delete process.env.CASHFREE_SECRET_KEY; else process.env.CASHFREE_SECRET_KEY = secret; }
});

test('only the authenticated owner may verify a payment', async () => {
  const f = fixture(); const result = await f.service.verify({ order_id: 7, user_id: 99 });
  assert.equal(result.status, -33); assert.equal(f.writes.length, 0); assert.equal(f.finalizations(), 0);
});

test('browser-submitted payment status, amount and payment id are ignored', async () => {
  const f = fixture(); f.service.gateway.getOrder = async () => ({ ...remote(f.local), order_status: 'ACTIVE' }); f.service.gateway.getPayments = async () => [];
  const result = await f.service.verify({ order_id: 7, user_id: 3, payment_status: 'SUCCESS', amount: 1, cf_payment_id: 'fake' });
  assert.equal(result.data.payment_status, 'PENDING'); assert.equal(f.finalizations(), 0);
});

test('server-confirmed payment is recorded and completed once on replay', async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).data.payment_status, 'PAID');
  assert.equal(f.finalizations(), 1);
  const records = f.writes.filter((w) => w.sql.startsWith('INSERT INTO payments '));
  assert.equal(records.length, 2); assert.match(records[0].sql, /ON DUPLICATE KEY UPDATE/);
  for (const record of records) assert.equal((record.sql.match(/\?/g) || []).length, record.params.length);
});

test('failed attempts leave the active order reservation available for retry', async () => {
  const f = fixture(); f.service.gateway.getOrder = async () => ({ ...remote(f.local), order_status: 'ACTIVE' }); f.service.gateway.getPayments = async () => [{ ...payment(), payment_status: 'FAILED' }];
  assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).data.payment_status, 'PENDING');
  assert.equal(f.releases(), 0); assert.equal(f.finalizations(), 0);
});

test('a wrong amount or a different gateway environment cannot fulfil an order', async () => {
  const f = fixture(); f.service.gateway.getPayments = async () => [{ ...payment(), payment_amount: 1 }];
  assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).status, -33); assert.equal(f.finalizations(), 0);
  f.local.gateway_environment = 'production'; assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).status, -33);
});

test('late payment is flagged for review rather than selling released stock', async () => {
  const f = fixture(); f.service.orders.finalizePaid = async () => { throw new PaymentHoldError('hold released'); };
  assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).data.payment_status, 'REVIEW');
  assert.equal(f.releases(), 0); assert.ok(f.writes.some(w => w.sql.includes('notifications')));
});

test('expired provider order releases only unpaid inventory', async () => {
  const f = fixture(); f.service.gateway.getOrder = async () => ({ ...remote(f.local), order_status: 'EXPIRED' }); f.service.gateway.getPayments = async () => [];
  assert.equal((await f.service.verify({ order_id: 7, user_id: 3 })).data.payment_status, 'EXPIRED'); assert.equal(f.releases(), 1);
});

test('unsigned webhooks cannot trigger order lookup or gateway access', async () => {
  const f = fixture(); f.service.dao.executeQuery = async () => { throw new Error('must not access storage'); };
  assert.equal((await f.service.webhook('{"type":"PAYMENT_SUCCESS_WEBHOOK"}', '', '')).httpStatus, 401);
});

test('the HTTP webhook preserves raw JSON and bypasses browser authentication only on its exact route', async () => {
  const app = express(); app.use(common); app.use(auth); app.use('/vipnumberworld/payments', paymentRoutes);
  const raw = '{ "type": "WEBHOOK_TEST", "amount": 399.50 }'; const time = '1790820000000';
  try {
    process.env.CASHFREE_SECRET_KEY = 'test-secret';
    const signature = crypto.createHmac('sha256', 'test-secret').update(time + raw).digest('base64');
    await supertest(app).post('/vipnumberworld/payments/cashfree/webhook').set('Content-Type', 'application/json').set('x-webhook-signature', signature).set('x-webhook-timestamp', time).send(raw).expect(200);
    await supertest(app).post('/vipnumberworld/payments/cashfree/webhook').set('Content-Type', 'application/json').send(raw).expect(401);
    await supertest(app).post('/vipnumberworld/payments/cashfree/webhook').set('Content-Type', 'application/json').set('x-webhook-signature', signature).set('x-webhook-timestamp', time).send('{"type":"WEBHOOK_TEST","amount":399.5}').expect(401);
  } finally { if (originalSecret === undefined) delete process.env.CASHFREE_SECRET_KEY; else process.env.CASHFREE_SECRET_KEY = originalSecret; }
});

test('create checkout uses the stored bill and safely resumes the same gateway session', async () => {
  const service: any = new Payments(); const local = { ...order(), customer_phone: '+91 99999 99999' };
  const creates: any[] = [];
  service.dao = { executeQuery: async () => ({ status: 1, rows: [local] }), getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string) => sql.includes('information_schema') ? [schemaRows] : sql.startsWith('SELECT') ? [[local]] : [{}] }) };
  const providerOrder = { ...remote(local), order_status: 'ACTIVE', payment_session_id: 'session-fixture' };
  service.gateway = { getOrder: async () => providerOrder, createOrder: async (body: any) => { creates.push(body); return providerOrder; } };
  const result = await service.createCashfreeOrder({ order_id: 7, user_id: 3, amount: 1, environment: 'production', return_url: 'https://attacker.example' });
  assert.equal(result.status, 1); assert.equal(result.data.payment_session_id, 'session-fixture'); assert.equal(result.data.environment, 'sandbox'); assert.equal(creates.length, 0);
  assert.equal(result.data.key_id, undefined); assert.equal(result.data.secret, undefined);
});

test('a signed refund webhook rechecks the merchant refund id with Cashfree', async () => {
  const f = fixture(); const raw = JSON.stringify({ type: 'REFUND_STATUS_WEBHOOK', data: { refund: { refund_id: 'vnw_ref_4_1' } } }); const time = '1790820000000';
  let id: any; f.service.prebooks.handleRefundWebhook = async (value: any) => { id = value; };
  try {
    process.env.CASHFREE_SECRET_KEY = 'test-secret';
    const signature = crypto.createHmac('sha256', 'test-secret').update(time + raw).digest('base64');
    assert.equal((await f.service.webhook(raw, signature, time)).httpStatus, 200); assert.equal(id, 'vnw_ref_4_1');
  } finally { if (originalSecret === undefined) delete process.env.CASHFREE_SECRET_KEY; else process.env.CASHFREE_SECRET_KEY = originalSecret; }
});

test('an unstarted live reservation cannot become a sandbox payment session', async () => {
  const service: any = new Payments(); const local = { ...order(), gateway_order_id: null, gateway_environment: 'production' }; let contacted = false;
  service.dao = { executeQuery: async () => ({ status: 1, rows: [local] }), getConnection: async () => ({ beginTransaction: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string) => sql.includes('information_schema') ? [schemaRows] : [[local]] }) };
  service.gateway = { getOrder: async () => { contacted = true; } };
  const result = await service.createCashfreeOrder({ order_id: 7, user_id: 3 });
  assert.equal(result.status, -33); assert.match(result.info, /different Cashfree environment/); assert.equal(contacted, false);
});

test('orders that lost their hold cannot be fulfilled by a delayed confirmation', async () => {
  for (const service of [new Orders(), new Prebooks()]) {
    const local = { ...order(), order_type: service instanceof Prebooks ? 'PREBOOK' : 'PURCHASE', status: 'CANCELLED' };
    let mutations = 0;
    (service as any).dao = { getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string) => { if (sql.startsWith('SELECT * FROM orders')) return [[local]]; if (sql.startsWith('SELECT * FROM prebookings')) return [[{ status: 'FAILED' }]]; mutations++; return [{}]; } }) };
    await assert.rejects(service.finalizePaid(7, { paid_at: new Date() }), PaymentHoldError); assert.equal(mutations, 0);
  }
});

test('a refund timeout retains PROCESSING and the same id for subsequent checks', async () => {
  const service: any = new Prebooks(); const request: any = { ...order(), payment_status: 'PAID', refund_request_id: 4, prebook_id: 9, amount: 399.50, status: 'PROCESSING', gateway_payment_id: '5007', gateway_refund_id: 'vnw_ref_4_1' };
  const get = CashfreeClient.prototype.getRefund; const create = CashfreeClient.prototype.createRefund;
  let creates = 0; let completed = 0; let writes = 0;
  service.completeRefund = async () => { completed++; };
  service.dao = { executeQuery: async () => { writes++; return { status: 1 }; }, getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async (sql: string) => sql.startsWith('SELECT') ? [[request]] : [{}] }) };
  try {
    CashfreeClient.prototype.getRefund = async () => { throw new CashfreeError(404, 'not found'); };
    CashfreeClient.prototype.createRefund = async () => { creates++; throw new CashfreeError(503, 'timeout'); };
    assert.equal((await service.approveRefund({ refund_request_id: 4, user_id: 1 })).status, -33); assert.equal(writes, 0); assert.equal(request.gateway_refund_id, 'vnw_ref_4_1');
    CashfreeClient.prototype.getRefund = async () => ({ refund_id: 'vnw_ref_4_1', order_id: request.gateway_order_id, cf_payment_id: '5007', refund_amount: 399.50, refund_currency: 'INR', refund_status: 'SUCCESS' });
    assert.equal((await service.approveRefund({ refund_request_id: 4, user_id: 1 })).status, 1); assert.equal(creates, 1); assert.equal(completed, 1);
  } finally { CashfreeClient.prototype.getRefund = get; CashfreeClient.prototype.createRefund = create; }
});
