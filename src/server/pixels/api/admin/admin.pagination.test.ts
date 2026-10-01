import assert from 'node:assert/strict';
import test from 'node:test';
import { Admin } from './admin';

test('admin orders apply the same filters to count and page queries', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const admin = new Admin();
    (admin as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('COUNT(*)') ? [{ total: 42 }] : [{ order_id: 7 }] };
    } };

    const response = await admin.ordersList({ status: 'paid', q: 'VNW', page: 3, limit: 15 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [{ order_id: 7 }], total: 42, page: 3, limit: 15, pages: 3 });
    assert.match(calls[0].sql, /o\.status = \?.*o\.order_no LIKE \?/);
    assert.deepEqual(calls[0].params, ['PAID', '%VNW%']);
    assert.deepEqual(calls[1].params, ['PAID', '%VNW%', 15, 30]);
});

test('admin users cap page size and bind search filters with offset', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const admin = new Admin();
    (admin as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('COUNT(*)') ? [{ total: 250 }] : [{ user_id: 9 }] };
    } };

    const response = await admin.usersList({ role: 'dealer', q: 'Ali', page: 2, limit: 1000 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [{ user_id: 9 }], total: 250, page: 2, limit: 1000, pages: 1 });
    assert.deepEqual(calls[0].params, ['DEALER', '%Ali%', '%Ali%', '%Ali%']);
    assert.deepEqual(calls[1].params.slice(-2), [1000, 1000]);
});
