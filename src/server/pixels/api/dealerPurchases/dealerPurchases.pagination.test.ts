import assert from 'node:assert/strict';
import test from 'node:test';
import { DealerPurchases } from './dealerPurchases';

test('supplier payments count and page within the selected dealer', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const purchases = new DealerPurchases();
    (purchases as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 70 }] : [{ dealer_payment_id: 6 }] };
    } };

    const response = await purchases.payments({ external_dealer_id: 4, page: 2, limit: 20 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [{ dealer_payment_id: 6 }], total: 70, page: 2, limit: 20 });
    assert.deepEqual(calls[0].params, [4]);
    assert.deepEqual(calls[1].params, [4, 20, 20]);
});

test('supplier inventory applies a stable order and bounded SQL offset', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const purchases = new DealerPurchases();
    (purchases as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 235 }] : [{ dealer_purchase_id: 6 }] };
    } };

    const response = await purchases.list({ state: 'INVENTORY', sort: 'created_at', page: 2.7, limit: 500 });
    assert.equal(response.status, 1);
    assert.equal(response.data.page, 2);
    assert.equal(response.data.limit, 500);
    assert.deepEqual(calls[0].params, ['INVENTORY']);
    assert.match(calls[1].sql, /ORDER BY dpn\.created_at DESC, dpn\.dealer_purchase_id DESC LIMIT \? OFFSET \?/);
    assert.deepEqual(calls[1].params, ['INVENTORY', 500, 500]);
});
