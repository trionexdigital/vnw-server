import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DealsOfDay } from './dealsOfDay';

const number = {
    number_id: 1,
    number_value: '9695951155',
    display_number: '969595 1155',
    seller_id: 1,
    seller_type: 'ADMIN',
    title_label: 'Numerology Special',
    badge: 'PREMIUM',
    mrp: 349999,
    offer_price: 259999,
    discount_pct: 25,
    numerology_sum: 5,
    operator: 'Any',
    description: 'Highly desirable',
    stock: 1,
    status: 'AVAILABLE',
    is_featured: 1,
    views: 10,
    created_at: '2026-01-01',
};

function serviceWithQueries(results: any[]) {
    const service = new DealsOfDay();
    const calls: Array<{ sql: string; params?: any[] }> = [];
    (service as any).dao = {
        executeQuery: async (sql: string, params?: any[]) => {
            calls.push({ sql, params });
            const next = results.shift();
            if (!next) throw new Error('Unexpected query');
            return next;
        },
    };
    return { service, calls };
}

describe('DealsOfDay', () => {
    it('returns eligible curated entries without consulting the fallback catalog', async () => {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [{ ...number, deal_id: 7, hero_label: 'Premium Pick', sort_order: 0, is_active: 1 }] },
        ]);

        const response: any = await service.publicList();
        assert.equal(response.status, 1);
        assert.equal(response.data.source, 'CURATED');
        assert.equal(response.data.items[0].deal_id, 7);
        assert.equal(response.data.items[0].hero_label, 'Premium Pick');
        assert.equal(calls.length, 1);
        assert.match(calls[0].sql, /n\.status = 'AVAILABLE'/);
    });

    it('uses featured available numbers when the curated list is empty', async () => {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [] },
            { status: 1, rows: [{ ...number, deal_id: null, hero_label: null, sort_order: null, is_active: 1 }] },
        ]);

        const response: any = await service.publicList();
        assert.equal(response.status, 1);
        assert.equal(response.data.source, 'FEATURED_FALLBACK');
        assert.equal(response.data.items[0].deal_id, null);
        assert.equal(calls.length, 2);
        assert.match(calls[1].sql, /n\.is_featured = 1/);
    });

    it('uses newest available numbers when no featured numbers qualify', async () => {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [] },
            { status: 1, rows: [] },
            { status: 1, rows: [{ ...number, number_id: 2, is_featured: 0 }] },
        ]);

        const response: any = await service.publicList();
        assert.equal(response.status, 1);
        assert.equal(response.data.source, 'FEATURED_FALLBACK');
        assert.equal(response.data.items[0].number_id, 2);
        assert.equal(calls.length, 3);
        assert.match(calls[2].sql, /ORDER BY n\.created_at DESC/);
        assert.match(calls[2].sql, /n\.status = 'AVAILABLE' AND n\.stock > 0/);
    });

    it('rejects selecting the same catalog number twice', async () => {
        const { service } = serviceWithQueries([
            { status: 1, rows: [{ number_id: 1 }] },
            { status: 1, rows: [{ deal_id: 9 }] },
        ]);

        const response: any = await service.save({ number_id: 1, is_active: true });
        assert.equal(response.status, -33);
        assert.match(response.info, /already in Lucky Pick of the Day/);
    });

    it('trims hero overrides and appends a new deal after the current ordering', async () => {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [{ number_id: 1 }] },
            { status: 1, rows: [] },
            { status: 1, insertId: 14 },
        ]);

        const response: any = await service.save({
            number_id: 1,
            hero_label: `  ${'L'.repeat(80)}  `,
            hero_description: `  ${'D'.repeat(190)}  `,
            is_active: false,
        });

        assert.equal(response.status, 1);
        assert.equal(response.data.deal_id, 14);
        assert.equal(calls[2].params?.[1].length, 64);
        assert.equal(calls[2].params?.[2].length, 160);
        assert.equal(calls[2].params?.[3], 0);
        assert.match(calls[2].sql, /COALESCE\(MAX\(sort_order\), -1\) \+ 1/);
    });

    it('reorders every configured entry in one transaction', async () => {
        const service = new DealsOfDay();
        const updates: Array<[number, number]> = [];
        let committed = false;
        let rolledBack = false;
        let released = false;
        (service as any).dao = {
            getConnection: async () => ({
                beginTransaction: async () => undefined,
                query: async (sql: string, params?: [number, number]) => {
                    if (sql.startsWith('SELECT')) return [[{ deal_id: 11 }, { deal_id: 12 }, { deal_id: 13 }]];
                    if (params) updates.push(params);
                    return [{}];
                },
                commit: async () => { committed = true; },
                rollback: async () => { rolledBack = true; },
                release: () => { released = true; },
            }),
        };

        const response: any = await service.reorder({ deal_ids: [13, 11, 12] });
        assert.equal(response.status, 1);
        assert.deepEqual(updates, [[0, 13], [1, 11], [2, 12]]);
        assert.equal(committed, true);
        assert.equal(rolledBack, false);
        assert.equal(released, true);
    });

    it('rolls back a stale ordering without partially updating rows', async () => {
        const service = new DealsOfDay();
        let updateCount = 0;
        let rolledBack = false;
        (service as any).dao = {
            getConnection: async () => ({
                beginTransaction: async () => undefined,
                query: async (sql: string) => {
                    if (sql.startsWith('SELECT')) return [[{ deal_id: 11 }, { deal_id: 12 }]];
                    updateCount += 1;
                    return [{}];
                },
                commit: async () => undefined,
                rollback: async () => { rolledBack = true; },
                release: () => undefined,
            }),
        };

        const response: any = await service.reorder({ deal_ids: [11, 13] });
        assert.equal(response.status, -33);
        assert.match(response.info, /ordering is stale/);
        assert.equal(updateCount, 0);
        assert.equal(rolledBack, true);
    });

    it('removes only the deal entry', async () => {
        const { service, calls } = serviceWithQueries([
            { status: 1, affectedRows: 1 },
        ]);

        const response: any = await service.remove({ deal_id: 7 });
        assert.equal(response.status, 1);
        assert.match(calls[0].sql, /DELETE FROM deal_of_day_numbers/);
        assert.doesNotMatch(calls[0].sql, /vip_numbers/);
        assert.deepEqual(calls[0].params, [7]);
    });
});
