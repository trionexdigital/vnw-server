import assert from 'node:assert/strict';
import test from 'node:test';
import { Approvals } from './approvals';

test('approval queue counts and pages the selected status', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const approvals = new Approvals();
    (approvals as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('COUNT(*)') ? [{ total: 63 }] : [{ approval_id: 21 }] };
    } };

    const response = await approvals.list({ status: 'pending', page: 2, limit: 20 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [{ approval_id: 21 }], total: 63, page: 2, limit: 20 });
    assert.deepEqual(calls[0].params, ['PENDING']);
    assert.deepEqual(calls[1].params, ['PENDING', 20, 20]);
});

test('employee submissions are scoped before pagination', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const approvals = new Approvals();
    (approvals as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('COUNT(*)') ? [{ total: 47 }] : [{ approval_id: 32 }] };
    } };

    const response = await approvals.mine({ user_id: 8, page: 3, limit: 10 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [{ approval_id: 32 }], total: 47, page: 3, limit: 10 });
    assert.deepEqual(calls[0].params, [8]);
    assert.deepEqual(calls[1].params, [8, 10, 20]);
});
