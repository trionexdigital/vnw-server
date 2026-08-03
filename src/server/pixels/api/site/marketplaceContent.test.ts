import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MarketplaceContent } from './marketplaceContent';

describe('MarketplaceContent', () => {
  const number = (number_id: number, number_value: string, offer_price = 10000) => ({
    number_id, number_value, display_number: number_value, offer_price,
    status: 'AVAILABLE', stock: 1, rtp_status: 'RTP', is_featured: number_id % 2,
  });

  it('automatically creates mixed packs with live totals', async () => {
    const service = new MarketplaceContent();
    (service as any).prebooks = { reconcile: async () => undefined };
    (service as any).dao = { executeQuery: async () => ({ status: 1, rows: [
      number(1, '9876500011', 12000), number(2, '9876600022', 18000), number(3, '9123400033'),
    ] }) };
    const response: any = await service.packs({ pack_type: 'MIXED', size: 2 });
    assert.equal(response.status, 1);
    assert.equal(response.data[0].size, 2);
    assert.equal(response.data[0].total_price, 30000);
    assert.equal(response.data[0].is_available, true);
    assert.match(response.data[0].pack_id, /^AUTO-MIXED-/);
  });

  it('matches series, start, end, and both-end packs from available numbers', async () => {
    const cases: Array<{ type: string; rows: any[] }> = [
      { type: 'SERIES', rows: [number(1, '9000000001'), number(2, '9000000002')] },
      { type: 'SIMILAR_START', rows: [number(1, '9876500011'), number(2, '9876599912')] },
      { type: 'SIMILAR_END', rows: [number(1, '9123400011'), number(2, '9876500011')] },
      { type: 'SIMILAR_BOTH', rows: [number(1, '9876123411'), number(2, '9876567811')] },
    ];
    for (const current of cases) {
      const service = new MarketplaceContent();
      (service as any).prebooks = { reconcile: async () => undefined };
      (service as any).dao = { executeQuery: async () => ({ status: 1, rows: current.rows }) };
      const response: any = await service.packs({ pack_type: current.type, size: 2 });
      assert.equal(response.status, 1, current.type);
      assert.equal(response.data[0]?.size, 2, current.type);
      assert.equal(response.data[0]?.pack_type, current.type, current.type);
    }
  });

  it('rejects pack sizes outside 2 to 10 before querying inventory', async () => {
    const service = new MarketplaceContent();
    (service as any).prebooks = { reconcile: async () => undefined };
    let queried = false;
    (service as any).dao = { executeQuery: async () => { queried = true; return { status: 1, rows: [] }; } };
    const response: any = await service.packs({ pack_type: 'MIXED', size: 11 });
    assert.equal(response.status, -33);
    assert.match(response.info, /between 2 and 10/);
    assert.equal(queried, false);
  });

  it('publishes only active FAQs through the public feed', async () => {
    const service = new MarketplaceContent();
    let sql = '';
    (service as any).dao = { executeQuery: async (query: string) => { sql = query; return { status: 1, rows: [] }; } };
    const response: any = await service.faqs(false);
    assert.equal(response.status, 1);
    assert.match(sql, /WHERE is_active = 1/);
  });

  it('rejects unsafe trusted-client logo formats', async () => {
    const service = new MarketplaceContent();
    const response: any = await service.clientUpload({ client_id: 3 }, { mimetype: 'image/svg+xml', data: Buffer.from('<svg/>') });
    assert.equal(response.status, -33);
    assert.match(response.info, /PNG, JPEG, or WebP/);
  });
});
