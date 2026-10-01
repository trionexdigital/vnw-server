import assert from 'node:assert/strict';
import test from 'node:test';
import { Dealer } from './dealer';

test('dealer sales count only the dealer inventory and bind page offset', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const dealer = new Dealer();
    (dealer as any).dao = { executeQuery: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('COUNT(*)') ? [{ total: 54 }] : [] };
    } };

    const response = await dealer.sales({ user_id: 12, page: 2, limit: 20 });
    assert.equal(response.status, 1);
    assert.deepEqual(response.data, { items: [], total: 54, page: 2, limit: 20 });
    assert.deepEqual(calls[0].params, [12]);
    assert.deepEqual(calls[1].params, [12, 20, 20]);
});
