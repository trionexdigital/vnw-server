import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Accessories } from './accessories';

const product = { accessory_id: 4, slug: 'charger', name: 'Fast Charger', brand: 'VNW', model: 'C20', sku: 'C20', category: 'Chargers', mrp: '1299', offer_price: '999', discount_pct: 23, stock: 6, reserved_stock: 1, available_stock: 5, highlights: '["20W output"]', specifications: '[{"label":"Output","value":"20W"}]', status: 'ACTIVE', image_count: 1, primary_image_id: 9 };

describe('Accessories merchandising', () => {
  it('publishes only explicitly curated active in-stock accessories without fallback', async () => {
    const service = new Accessories(); const calls: string[] = [];
    (service as any).dao = { executeQuery: async (sql: string) => {
      calls.push(sql);
      if (/FROM accessory_images WHERE accessory_id IN/.test(sql)) return { rows: [
        { image_id: 9, accessory_id: 4, original_name: 'front.png', mime_type: 'image/png', byte_size: 42, alt_text: 'Front', sort_order: 0, is_primary: 1 },
        { image_id: 10, accessory_id: 4, original_name: 'side.png', mime_type: 'image/png', byte_size: 43, alt_text: 'Side', sort_order: 1, is_primary: 0 },
      ] };
      return { rows: [{ ...product, homepage_accessory_id: 2, sort_order: 0, homepage_active: 1 }] };
    } };
    const response: any = await service.homeAccessories(false);
    assert.equal(response.status, 1); assert.equal(response.data.length, 1); assert.equal(response.data[0].available_stock, 5);
    assert.deepEqual(response.data[0].images.map((image: any) => image.image_id), [9, 10]);
    assert.equal(calls.length, 2); assert.match(calls[0], /h\.is_active=1/); assert.match(calls[0], /p\.status='ACTIVE'/); assert.match(calls[0], /p\.stock-p\.reserved_stock/); assert.match(calls[1], /FROM accessory_images/);
  });

  it('stores a batch of validated accessory images as ordered MySQL blobs', async () => {
    const service = new Accessories(); const inserts: any[][] = []; let nextId = 101; let committed = false;
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => { committed = true; },
      rollback: async () => undefined,
      release: () => undefined,
      query: async (sql: string, params: any[] = []) => {
        if (/SELECT accessory_id FROM accessory_products/.test(sql)) return [[{ accessory_id: 4 }]];
        if (/SELECT image_id,content_sha256/.test(sql)) return [[]];
        if (/INSERT INTO accessory_images/.test(sql)) { inserts.push(params); return [{ insertId: nextId++ }]; }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    (service as any).dao = { getConnection: async () => connection };
    const png = (lastByte: number, width = 1200, height = 1200) => {
      const image = Buffer.alloc(32); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
      image.writeUInt32BE(width, 16); image.writeUInt32BE(height, 20); image[31] = lastByte; return image;
    };
    const response: any = await service.upload({ accessory_id: 4, alt_text: 'Fast Charger' }, [
      { name: 'front.png', mimetype: 'image/png', data: png(1), size: 32 },
      { name: 'side.png', mimetype: 'image/png', data: png(2), size: 32 },
    ]);
    assert.equal(response.status, 1); assert.equal(response.data.uploaded, 2); assert.deepEqual(response.data.image_ids, [101, 102]);
    assert.equal(inserts.length, 2); assert.ok(Buffer.isBuffer(inserts[0][5])); assert.equal(inserts[0][8], 1); assert.equal(inserts[1][8], 0); assert.equal(committed, true);
  });

  it('rejects product images that are not cropped to the fixed square ratio', async () => {
    const image = Buffer.alloc(32); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    image.writeUInt32BE(1200, 16); image.writeUInt32BE(900, 20);
    const service = new Accessories();
    const response: any = await service.upload({ accessory_id: 4 }, { name: 'wide.png', mimetype: 'image/png', data: image, size: image.length });
    assert.equal(response.status, -33); assert.match(response.info, /fixed 1:1 square crop/);
  });

  it('keeps premium homepage order while suppressing unavailable catalog rows in SQL', async () => {
    const service = new Accessories(); let sql = '';
    (service as any).dao = { executeQuery: async (query: string) => { sql = query; return { rows: [] }; } };
    const response: any = await service.homePremium(false);
    assert.equal(response.status, 1); assert.deepEqual(response.data, []); assert.match(sql, /h\.is_active=1/); assert.match(sql, /n\.status='AVAILABLE'/); assert.match(sql, /n\.stock>0/); assert.match(sql, /ORDER BY h\.sort_order/);
  });

  it('excludes inactive and zero-stock products from the public catalog query', async () => {
    const service = new Accessories(); const calls: string[] = []; const results = [{ rows: [{ total: 0 }] }, { rows: [] }, { rows: [] }];
    (service as any).dao = { executeQuery: async (sql: string) => { calls.push(sql); return results.shift(); } };
    const response: any = await service.list({}, false);
    assert.equal(response.status, 1); assert.match(calls[0], /p\.status='ACTIVE'/); assert.match(calls[0], /p\.stock-p\.reserved_stock/);
  });
});
