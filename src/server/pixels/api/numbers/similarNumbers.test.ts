import assert from 'node:assert/strict';
import test from 'node:test';
import { Numbers } from './numbers';
import { rankSimilarNumbers, scoreSimilarNumber } from './similarNumbers';

const source = {
    number_id: 1,
    number_value: '9193999999',
    display_number: '9193 999 999',
    offer_price: 100000,
    numerology_sum: 3,
    status: 'AVAILABLE',
    stock: 1,
    views: 5,
    created_at: '2026-01-01T00:00:00.000Z',
};

function candidate(overrides: Record<string, any>) {
    return {
        number_id: 2,
        number_value: '9193888888',
        display_number: '9193 888 888',
        offer_price: 110000,
        numerology_sum: 3,
        status: 'AVAILABLE',
        stock: 1,
        views: 1,
        created_at: '2026-01-02T00:00:00.000Z',
        ...overrides,
    };
}

test('similar score prioritizes automatic category and visible digit resemblance', () => {
    const strongPattern = candidate({ number_id: 2, number_value: '9193999988', display_number: '9193 999 988' });
    const weakPattern = candidate({ number_id: 3, number_value: '7000000003', display_number: '7000 000 003', offer_price: 100000 });
    const strongScore = scoreSimilarNumber(source, strongPattern);
    const weakScore = scoreSimilarNumber(source, weakPattern);

    assert.ok(strongScore.prefixLength > weakScore.prefixLength);
    assert.ok(strongScore.positionalMatches > weakScore.positionalMatches);
    assert.ok(strongScore.score > weakScore.score);
});

test('similar ranking uses numerology, price, popularity, recency and id as stable tie breakers', () => {
    const numerologyAndPrice = candidate({ number_id: 10, offer_price: 101000, numerology_sum: 3 });
    const differentNumerology = candidate({ number_id: 11, offer_price: 101000, numerology_sum: 8 });
    assert.equal(rankSimilarNumbers(source, [differentNumerology, numerologyAndPrice])[0].number_id, 10);

    const older = candidate({ number_id: 12, views: 9, created_at: '2025-01-01T00:00:00.000Z' });
    const newer = candidate({ number_id: 13, views: 9, created_at: '2026-01-01T00:00:00.000Z' });
    assert.equal(rankSimilarNumbers(source, [older, newer])[0].number_id, 13);

    const lowerId = candidate({ number_id: 14, views: 9 });
    const higherId = candidate({ number_id: 15, views: 9 });
    assert.equal(rankSimilarNumbers(source, [lowerId, higherId])[0].number_id, 15);
});

test('similar ranking excludes source, unavailable and zero-stock candidates', () => {
    const ranked = rankSimilarNumbers(source, [
        candidate({ number_id: 1 }),
        candidate({ number_id: 2, status: 'SOLD' }),
        candidate({ number_id: 3, stock: 0 }),
        candidate({ number_id: 4 }),
    ]);
    assert.deepEqual(ranked.map((item) => item.number_id), [4]);
});

test('numbers/similar returns stable pagination from a bounded candidate pool', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const calls: Array<{ sql: string; params: any[] }> = [];
    (numbers as any).dao = {
        executeQuery: async (sql: string, params: any[] = []) => {
            calls.push({ sql, params });
            if (sql.includes('WHERE n.number_id = ?') && sql.includes('LIMIT 1')) {
                return { status: 1, rows: [source], fetchedRows: 1 };
            }
            return {
                status: 1,
                rows: [
                    candidate({ number_id: 2, number_value: '9193999998' }),
                    candidate({ number_id: 3, number_value: '9193999988' }),
                    candidate({ number_id: 4, number_value: '9193999888' }),
                ],
                fetchedRows: 3,
            };
        },
    };

    const result: any = await numbers.similar({ number_id: 1, page: 2, limit: 1 });
    assert.equal(result.status, 1);
    assert.equal(result.data.source.number_id, 1);
    assert.equal(result.data.total, 3);
    assert.equal(result.data.page, 2);
    assert.equal(result.data.limit, 1);
    assert.equal(result.data.pages, 3);
    assert.equal(result.data.items.length, 1);
    assert.match(calls[1].sql, /n\.status = 'AVAILABLE' AND n\.stock > 0/);
    assert.match(calls[1].sql, /LIMIT 600/);
    assert.deepEqual(calls[1].params.slice(0, 1 + result.data.source.categories.length), [1, ...result.data.source.categories.map((category: any) => category.slug)]);
});

test('numbers/similar rejects missing and unknown source IDs', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    (numbers as any).dao = {
        executeQuery: async () => ({ status: 1, rows: [], fetchedRows: 0 }),
    };

    const missing: any = await numbers.similar({ number_id: 0 });
    assert.equal(missing.status, -33);
    assert.match(missing.info, /number_id is required/);

    const unknown: any = await numbers.similar({ number_id: 999 });
    assert.equal(unknown.status, -33);
    assert.match(unknown.info, /Number not found/);
});
