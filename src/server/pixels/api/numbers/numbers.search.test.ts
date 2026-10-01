import assert from 'node:assert/strict';
import test from 'node:test';
import { Numbers } from './numbers';
import {
    compileStructuredSearch,
    normalizeStructuredSearch,
    sanitizeAiFilters,
    validatePrice,
} from './numberSearch';

function queryResult(rows: any[] = []) {
    return { status: 1, info: 'SUCCESS', rows, fetchedRows: rows.length };
}

test('structured predicates bind every user value instead of interpolating SQL', () => {
    const compiled = compileStructuredSearch({
        starts_with: '98',
        anywhere: '786',
        ends_with: '55',
        must_contain: ['11', '22'],
        must_not_contain: ['13'],
        exact_mask: '98??5?????',
        digit_frequencies: [{ digit: 7, min: 2, max: 4 }],
        digit_sum: 45,
        mid_sum: 9,
        score_sum: 9,
    });
    const sql = compiled.where.join(' AND ');

    assert.doesNotMatch(sql, /786|98\?\?|%55|digit.?7/i);
    assert.ok(compiled.params.includes('98%'));
    assert.ok(compiled.params.includes('%786%'));
    assert.ok(compiled.params.includes('%55'));
    assert.ok(compiled.params.includes('98__5_____'));
    assert.ok(compiled.params.includes('7'));
    assert.ok(compiled.params.includes(45));
    assert.match(sql, /NOT LIKE \?/);
    assert.match(sql, /CHAR_LENGTH/);
    assert.match(sql, /SUBSTRING/);
});

test('all supported pattern presets compile for either number edge', () => {
    const presets = [
        'double', 'triple', 'tetra', 'penta', 'hexa', 'counting',
        'doubling', 'abc_abc', 'ab_ab', 'mirror', 'semi_mirror',
    ];
    presets.forEach((preset) => {
        const starts = compileStructuredSearch({ starts_with_pattern: preset });
        const ends = compileStructuredSearch({ ends_with_pattern: preset });
        assert.equal(starts.where.length, 1, `${preset} starts predicate`);
        assert.equal(ends.where.length, 1, `${preset} ends predicate`);
    });
});

test('structured validation rejects invalid masks, sums, duplicate frequency digits and ranges', () => {
    assert.throws(() => normalizeStructuredSearch({ exact_mask: '98??' }), /exact_mask/);
    assert.throws(() => normalizeStructuredSearch({ digit_sum: 91 }), /digit_sum/);
    assert.throws(() => normalizeStructuredSearch({ mid_sum: 18 }), /mid_sum/);
    assert.throws(() => normalizeStructuredSearch({ score_sum: 0 }), /score_sum/);
    assert.throws(() => normalizeStructuredSearch({
        digit_frequencies: [{ digit: 7, min: 2 }, { digit: 7, max: 3 }],
    }), /only be used once/);
    assert.throws(() => normalizeStructuredSearch({
        digit_frequencies: [{ digit: 7, min: 5, max: 2 }],
    }), /cannot exceed/);
    assert.throws(() => validatePrice(1000001, 'price_max'), /10,00,000/);
});

test('AI output sanitizer retains only validated schema values', () => {
    const filters: any = sanitizeAiFilters({
        q: '98 76',
        price_min: 1501,
        price_max: 3000,
        sort: 'price_asc',
        badge: 'rare',
        injected_sql: 'DROP TABLE vip_numbers',
        search: {
            anywhere: '786',
            digit_frequencies: [{ digit: 7, min: 2 }],
            unknown: 'ignored',
        },
    });

    assert.equal(filters.q, '9876');
    assert.equal(filters.price_min, 1501);
    assert.equal(filters.badge, 'RARE');
    assert.equal(filters.sort, 'price_asc');
    assert.deepEqual(filters.search, {
        anywhere: '786',
        digit_frequencies: [{ digit: 7, min: 2 }],
    });
    assert.equal(filters.injected_sql, undefined);
});

test('deterministic AI fallback understands common English and Hinglish constraints', () => {
    const numbers = new Numbers();
    const parsed: any = (numbers as any).localAiFilters(
        'mirror number akhir mein 786, digit 7 3 baar, root sum 9, 30k tak',
    );

    assert.equal(parsed.filters.search.ends_with, '786');
    assert.deepEqual(parsed.filters.search.digit_frequencies, [{ digit: 7, min: 3 }]);
    assert.equal(parsed.filters.search.score_sum, 9);
    assert.equal(parsed.filters.price_max, 30000);
    assert.match(parsed.explanation, /786/);
});

test('AI search preserves a selected child and combines it with price and digit filters', async () => {
    const numbers = new Numbers();
    let listing: any;
    (numbers as any).openAiFilters = async () => ({ filters: { category: 'customer-care-numbers', sort: 'popular' }, explanation: 'Mirror pattern' });
    (numbers as any).list = async (payload: any) => { listing = payload; return { status: 1, info: 'OK', data: { items: [], total: 0 } }; };
    const response: any = await numbers.aiSearch({
        query: 'Mirror Ulta-Pulta',
        category: 'customer-care-numbers',
        subcategory_id: 104,
        price_min: 1500,
        price_max: 3000,
        search: { anywhere: '786' },
        page: 2,
    });
    assert.equal(response.status, 1);
    assert.equal(listing.category, 'customer-care-numbers');
    assert.equal(listing.subcategory_id, 104);
    assert.equal(listing.price_min, 1500);
    assert.equal(listing.price_max, 3000);
    assert.equal(listing.search.anywhere, '786');
    assert.equal(listing.page, 2);
});

test('AI text infers a unique child but leaves shared child names unselected', async () => {
    const numbers = new Numbers();
    const listings: any[] = [];
    (numbers as any).openAiFilters = async () => null;
    (numbers as any).list = async (payload: any) => { listings.push(payload); return { status: 1, info: 'OK', data: { items: [], total: 0 } }; };
    await numbers.aiSearch({ query: 'show 3 Couples' });
    await numbers.aiSearch({ query: 'Ulta-Pulta' });
    assert.deepEqual([listings[0].category, listings[0].subcategory_id], ['doublling-aabbcc', 52]);
    assert.equal(listings[1].subcategory_id, undefined);
});

test('numbers/list combines category, price and structured predicates with AND', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const calls: Array<{ sql: string; params: any[] }> = [];
    (numbers as any).dao = {
        executeQuery: async (sql: string, params: any[] = []) => {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*)')) return queryResult([{ total: 0 }]);
            return queryResult([]);
        },
    };

    const result: any = await numbers.list({
        category: 'customer-care-numbers',
        price_min: 1501,
        price_max: 3000,
        search: { starts_with: '98', must_contain: ['786'] },
    });
    assert.equal(result.status, 1);
    assert.match(calls[0].sql, /vip_number_categories/);
    assert.match(calls[0].sql, /offer_price >= \?/);
    assert.match(calls[0].sql, /offer_price <= \?/);
    assert.match(calls[0].sql, /LIKE \?[\s\S]*AND[\s\S]*LIKE \?/);
    assert.ok(calls[0].params.includes('customer-care-numbers'));
    assert.ok(calls[0].params.includes(1501));
    assert.ok(calls[0].params.includes('98%'));
});

test('closest matches relax one transparent condition and cap each group at six', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    (numbers as any).dao = {
        executeQuery: async (sql: string) => {
            const hasMask = sql.includes('LIKE ?');
            if (sql.includes('COUNT(*)')) return queryResult([{ total: hasMask ? 0 : 8 }]);
            if (hasMask) return queryResult([]);
            return queryResult(Array.from({ length: 8 }, (_, index) => ({
                number_id: index + 1,
                number_value: `98765000${String(index + 10).slice(-2)}`,
                display_number: `98765 000${String(index + 10).slice(-2)}`,
                status: 'AVAILABLE',
                offer_price: 2500,
            })));
        },
    };

    const result: any = await numbers.list({
        search: { exact_mask: '98??5?????', include_alternatives: true },
    });
    assert.equal(result.status, 1);
    assert.equal(result.data.total, 0);
    assert.equal(result.data.alternatives.length, 1);
    assert.equal(result.data.alternatives[0].relaxed_key, 'exact_mask');
    assert.match(result.data.alternatives[0].label, /exact position mask/i);
    assert.equal(result.data.alternatives[0].items.length, 6);
});

test('closest matches relax a child before its parent without sending a child without a category', async () => {
    const numbers = new Numbers();
    const attempted: any[] = [];
    (numbers as any).queryListing = async (payload: any) => {
        attempted.push(payload);
        return { items: [], total: 0, page: 1, limit: 6, pages: 0 };
    };
    await (numbers as any).findAlternatives({ category: 'customer-care-numbers', subcategory_id: 104, search: {} });
    assert.equal(attempted[0].category, 'customer-care-numbers');
    assert.equal(attempted[0].subcategory_id, undefined);
    assert.equal(attempted[1].category, undefined);
    assert.equal(attempted[1].subcategory_id, undefined);
});

test('alternatives are absent when exact results exist', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    (numbers as any).dao = {
        executeQuery: async (sql: string) => sql.includes('COUNT(*)')
            ? queryResult([{ total: 1 }])
            : queryResult([{
                number_id: 1,
                number_value: '9876543210',
                display_number: '98765 43210',
                status: 'AVAILABLE',
            }]),
    };
    const result: any = await numbers.list({
        search: { anywhere: '786', include_alternatives: true },
    });
    assert.equal(result.status, 1);
    assert.equal(result.data.total, 1);
    assert.equal('alternatives' in result.data, false);
});
