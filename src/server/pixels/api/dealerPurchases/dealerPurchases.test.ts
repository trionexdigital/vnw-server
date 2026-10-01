import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DealerPurchases } from './dealerPurchases';

describe('dealer purchase validation', () => {
  it('rejects duplicate numbers before starting a transaction', async () => {
    const service = new DealerPurchases(); let connected = false;
    (service as any).dao = { getConnection: async () => { connected = true; throw new Error('should not connect'); } };
    const response: any = await service.create({ user_id: 1, external_dealer_id: 2, numbers: '9876543210\n9876543210', visibility_type: 'ONLINE', purchase_price: 100, intended_sale_price: 200 });
    assert.equal(response.status, -33); assert.match(response.info, /duplicate/i); assert.equal(connected, false);
  });

  it('accepts Offline dealer inventory without a per-number collection', async () => {
    const service = new DealerPurchases(); let connected = false;
    (service as any).dao = { getConnection: async () => { connected = true; throw new Error('should not connect'); } };
    const response: any = await service.create({ user_id: 1, external_dealer_id: 2, numbers: '9876543210', visibility_type: 'OFFLINE', purchase_price: 100, intended_sale_price: 200 });
    assert.equal(response.status, -33); assert.match(response.info, /should not connect/i); assert.equal(connected, true);
  });

  it('rejects supplier overpayments and rolls back', async () => {
    const service = new DealerPurchases(); let rolledBack = false;
    (service as any).dao = { getConnection: async () => ({
      beginTransaction: async () => undefined,
      query: async (sql: string) => {
        if (sql.includes('COALESCE(SUM(purchase_price)')) return [[{ billed: '1000.00', paid: '800.00' }]];
        throw new Error(`Unexpected query: ${sql}`);
      },
      commit: async () => undefined, rollback: async () => { rolledBack = true; }, release: () => undefined,
    }) };
    const response: any = await service.recordPayment({ user_id: 1, external_dealer_id: 2, amount: 250, paid_at: '2026-09-22 10:00:00' });
    assert.equal(response.status, -33); assert.match(response.info, /exceeds the remaining/i); assert.equal(rolledBack, true);
  });
});
