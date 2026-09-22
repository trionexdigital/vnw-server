import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Cart } from './cart';

describe('Cart.addMany', () => {
  it('adds a complete available pack in one transaction', async () => {
    const cart = new Cart();
    const inserted: number[] = [];
    let committed = false;
    const connection = {
      beginTransaction: async () => undefined,
      query: async (sql: string, params: any[]) => {
        if (sql.includes('FROM vip_numbers')) return [[
          { number_id: 1, display_number: '9000 000 001', status: 'AVAILABLE', stock: 1, rtp_status: 'RTP' },
          { number_id: 2, display_number: '9000 000 002', status: 'AVAILABLE', stock: 1, rtp_status: 'RTA' },
        ]];
        if (sql.includes('FROM carts')) return [[{ cart_id: 7 }]];
        if (sql.startsWith('INSERT IGNORE INTO cart_items')) { inserted.push(Number(params[1])); return [{}]; }
        throw new Error(`Unexpected query: ${sql}`);
      },
      commit: async () => { committed = true; }, rollback: async () => undefined, release: () => undefined,
    };
    let listQuery = 0;
    (cart as any).dao = {
      getConnection: async () => connection,
      executeQuery: async () => (++listQuery === 1 ? { status: 1, fetchedRows: 1, rows: [{ cart_id: 7 }] } : { status: 1, rows: [] }),
    };
    (cart as any).prebooks = { reconcile: async () => undefined };
    const response: any = await cart.addMany({ user_id: 9, number_ids: [1, 2] });
    assert.equal(response.status, 1);
    assert.deepEqual(inserted, [1, 2]);
    assert.equal(committed, true);
  });

  it('rolls back without inserts when any pack number is unavailable', async () => {
    const cart = new Cart();
    let rolledBack = false;
    let inserts = 0;
    (cart as any).dao = { getConnection: async () => ({
      beginTransaction: async () => undefined,
      query: async (sql: string) => {
        if (sql.includes('FROM vip_numbers')) return [[
          { number_id: 1, display_number: '9000 000 001', status: 'AVAILABLE', stock: 1, rtp_status: 'RTP' },
          { number_id: 2, display_number: '9000 000 002', status: 'SOLD', stock: 0, rtp_status: 'RTP' },
        ]];
        inserts += 1; return [{}];
      },
      commit: async () => undefined, rollback: async () => { rolledBack = true; }, release: () => undefined,
    }) };
    (cart as any).prebooks = { reconcile: async () => undefined };
    const response: any = await cart.addMany({ user_id: 9, number_ids: [1, 2] });
    assert.equal(response.status, -33);
    assert.equal(inserts, 0);
    assert.equal(rolledBack, true);
  });
});
