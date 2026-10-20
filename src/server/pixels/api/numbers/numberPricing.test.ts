import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { calculateNumberPricing, resolveNumberPricing } from './numberPricing';
import { Numbers } from './numbers';
import { Admin } from '../admin/admin';
import { verifyAnalysis } from '../admin/numberImport';
import { calculateBilling } from '../orders/billing';

test('adds 25%, always discounts 5%, then applies the independent additional discount', () => {
    assert.deepEqual(calculateNumberPricing(2500), { base_price: '2500.00', mrp: '3125.00', offer_price: '2968.75', additional_discount_pct: '0.00', discount_pct: '5.00' });
    assert.equal(calculateNumberPricing('2500', '10').offer_price, '2671.88');
    assert.equal(calculateNumberPricing('2500', '10').discount_pct, '14.50');
    assert.equal(calculateNumberPricing('2500', '').offer_price, '2968.75');
    assert.equal(calculateNumberPricing('2500', '50').offer_price, '1484.38');
    assert.equal(calculateNumberPricing('0.02', '50').offer_price, '0.01');
    assert.equal(calculateNumberPricing('2500', '99.99').offer_price, '0.30');
});

test('rejects malformed amounts, percentages, overflow and prices rounded below one paisa', () => {
    for (const base of [0, -1, '', null, '1.123', '1e3', Infinity, '9999999999999999.99']) assert.throws(() => calculateNumberPricing(base));
    for (const discount of [-1, 100, '100.00', '1.123', 'no', Infinity]) assert.throws(() => calculateNumberPricing(2500, discount));
    assert.throws(() => calculateNumberPricing('0.01', '99'));
    assert.equal(calculateNumberPricing('1234567890123456.78').offer_price, '1466049369521604.93');
});

test('legacy and converted updates preserve the base and omitted discounts without compounding', () => {
    const legacy = { mrp: '2500.00', offer_price: '1250.00', base_price: null };
    const converted = resolveNumberPricing({}, legacy);
    assert.equal(converted.offer_price, '2968.75');
    let saved = converted;
    for (let i = 0; i < 5; i++) saved = resolveNumberPricing({ mrp: saved.mrp }, saved);
    assert.deepEqual(saved, converted);
    saved = resolveNumberPricing({ additional_discount_pct: 10 }, saved);
    assert.equal(resolveNumberPricing({}, saved).offer_price, '2671.88');
    assert.equal(resolveNumberPricing({ additional_discount_pct: '' }, saved).offer_price, '2968.75');
    assert.equal(resolveNumberPricing({ base_price: 3000 }, saved).offer_price, '3206.25');
    assert.throws(() => resolveNumberPricing({ mrp: 2600 }, saved), /Use base_price/);
});

test('a number update locks, persists and recalculates from its stored inputs on every save', async () => {
    const service = new Numbers();
    (service as any).prebooks = { reconcile: async () => undefined };
    const state: any = { number_value: '8008005413', display_number: '8008005413', mrp: '2500.00', offer_price: '1250.00', status: 'AVAILABLE', rtp_status: 'RTP' };
    const connection = {
        beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
        query: async (sql: string, values: any[] = []) => {
            if (sql.includes('SELECT number_value, display_number')) { assert.match(sql, /FOR UPDATE/); return [[{ ...state }]]; }
            if (sql.startsWith('UPDATE vip_numbers SET')) {
                const fields = sql.split(' SET ')[1].split(' WHERE ')[0].split(', ');
                fields.forEach((field, i) => state[field.split(' = ')[0]] = values[i]);
            }
            return [{ affectedRows: 1 }];
        },
    };
    (service as any).dao = { getConnection: async () => connection };
    for (let i = 0; i < 3; i++) {
        const response: any = await service.update({ number_id: 1, title_label: 'VIP Number' });
        assert.equal(response.status, 1, response.info);
        assert.equal(state.base_price, '2500.00');
        assert.equal(state.offer_price, '2968.75');
    }
    await service.update({ number_id: 1, additional_discount_pct: '10' });
    assert.equal(state.offer_price, '2671.88');
    await service.update({ number_id: 1, additional_discount_pct: '' });
    assert.equal(state.offer_price, '2968.75');
});

test('Settings ignores retired discount inputs and never reprices any number', async () => {
    const service = new Admin(); const calls: string[] = [];
    (service as any).dao = { getConnection: async () => ({
        beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
        query: async (sql: string, params: any[]) => { calls.push(sql); assert.ok(!params?.includes('GLOBAL_NUMBER_DISCOUNT_PERCENT')); return [{ affectedRows: 1 }]; },
    }) };
    const response: any = await service.settingsSave({ CONTACT_PHONE: '123', GST_PERCENT: '18', GLOBAL_NUMBER_DISCOUNT_PERCENT: 50 });
    assert.equal(response.status, 1, response.info);
    assert.ok(calls.length > 0);
    assert.ok(calls.every(sql => !sql.includes('vip_numbers')));
});

test('old pricing import tickets require fresh analysis', () => {
    const body = Buffer.from(JSON.stringify({ user_id: 1, expires: Date.now() + 30000, rows: [{}] })).toString('base64url');
    const signature = createHmac('sha256', 'secret').update('number-import-v1:' + body).digest('base64url');
    assert.throws(() => verifyAnalysis(`${body}.${signature}`, 1, 'secret'), /invalid/);
    const previousFieldRules = createHmac('sha256', 'secret').update('number-import-pricing-v2:' + body).digest('base64url');
    assert.throws(() => verifyAnalysis(`${body}.${previousFieldRules}`, 1, 'secret'), /invalid/);
});

test('management listings expose pricing inputs; public callers cannot request them', async () => {
    for (const management of [false, true]) {
        const service = new Numbers(); const queries: string[] = [];
        (service as any).prebooks = { reconcile: async () => undefined };
        (service as any).dao = { executeQuery: async (sql: string) => {
            queries.push(sql);
            const row = { number_id: 1, number_value: '8008005413', display_number: '8008005413', mrp: '3125.00', offer_price: '2968.75', stock: 1, status: 'AVAILABLE', rtp_status: 'RTP' };
            return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 1 }] : sql.includes('vip_number_serviceable_pins') ? [] : [{ ...row, ...(sql.includes('n.base_price') ? { base_price: '2500.00', additional_discount_pct: '0.00' } : {}) }] };
        } };
        const response: any = await service.list({ admin_scope: true, rtp_status: 'RTP' }, management);
        assert.equal(response.status, 1, response.info);
        assert.equal(response.data.items[0].base_price, management ? '2500.00' : undefined);
        assert.equal(queries.some(sql => sql.includes('n.base_price')), management);
    }
});

test('checkout consumes the final stored price and retains GST/coupon ordering', () => {
    const price = calculateNumberPricing('2500', '10');
    const quote = calculateBilling([price], 18);
    assert.equal(quote.subtotal, 2671.88);
    assert.equal(quote.gst_amount, 480.94);
    assert.equal(quote.total, 3152.82);
    assert.equal(quote.mrp_total, 3125);
    assert.equal(price.base_price, '2500.00');
});
