import assert from 'node:assert/strict';
import test from 'node:test';
import { Numbers } from './numbers';
import { CATEGORY_CLASSIFIER_VERSION } from '../categories/categoryClassifier';

function queryResult(rows: any[] = []) {
    return { status: 1, info: 'SUCCESS', rows, fetchedRows: rows.length };
}

test('numbers/list rejects anything except a catalog category slug', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    let queried = false;
    (numbers as any).dao = {
        executeQuery: async () => {
            queried = true;
            return queryResult();
        },
    };

    const result: any = await numbers.list({ category: '1' });
    assert.equal(result.status, -33);
    assert.match(result.info, /Unknown category slug: 1/);
    assert.equal(queried, false);
});

test('numbers/list validates parent-scoped subcategories and uses the subcategory index', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const calls: Array<{ sql: string; params: any[] }> = [];
    (numbers as any).dao = { executeQuery: async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return sql.includes('COUNT(*)') ? queryResult([{ total: 0 }]) : queryResult([]);
    } };
    const invalid: any = await numbers.list({ category: 'doublling-aabbcc', subcategory_id: 84 });
    assert.equal(invalid.status, -33);
    assert.equal(calls.length, 0);
    const valid: any = await numbers.list({ category: 'doublling-aabbcc', subcategory_id: 63 });
    assert.equal(valid.status, 1);
    assert.match(calls[0].sql, /vip_number_subcategories/);
    assert.doesNotMatch(calls[0].sql, /vip_number_categories/);
    assert.deepEqual(calls[0].params.slice(1, 4), [18, 63, CATEGORY_CLASSIFIER_VERSION]);
});

test('numbers/list filters through the derived index and returns all matching categories and subcategories', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const calls: Array<{ sql: string; params: any[] }> = [];
    (numbers as any).dao = {
        executeQuery: async (sql: string, params: any[] = []) => {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*)')) return queryResult([{ total: 1 }]);
            return queryResult([{
                number_id: 9,
                number_value: '7693976939',
                display_number: '76939 76939',
                mrp: 20000,
                offer_price: 15000,
                status: 'AVAILABLE',
            }]);
        },
    };

    const result: any = await numbers.list({ category: 'customer-care-numbers', page: 2, limit: 12 });
    assert.equal(result.status, 1);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.page, 2);
    assert.ok(result.data.items[0].categories.some((category: any) => category.slug === 'customer-care-numbers'));
    assert.equal(result.data.items[0].category_slug, result.data.items[0].primary_category?.slug);
    assert.ok(result.data.items[0].categories.length > 1);
    assert.deepEqual(result.data.items[0].primary_category.match_spans, []);
    assert.equal(result.data.items[0].primary_category.sort_order, 1);
    assert.equal('sortOrder' in result.data.items[0].primary_category, false);
    assert.match(calls[0].sql, /vip_number_categories/);
    assert.doesNotMatch(calls[0].sql, /JOIN\s+categories/i);
    assert.equal(calls[0].params[1], 'customer-care-numbers');
    assert.equal(calls[0].params[2], CATEGORY_CLASSIFIER_VERSION);
    assert.deepEqual(calls[1].params.slice(-2), [12, 12]);
});

test('numbers/create classifies in the same transaction and ignores legacy category_id', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const sql: string[] = [];
    let began = 0;
    let committed = 0;
    let rolledBack = 0;
    let released = 0;
    const connection = {
        beginTransaction: async () => { began += 1; },
        commit: async () => { committed += 1; },
        rollback: async () => { rolledBack += 1; },
        release: () => { released += 1; },
        query: async (statement: string) => {
            sql.push(statement);
            if (statement.includes('INSERT INTO vip_numbers')) return [{ insertId: 41 }];
            return [{ affectedRows: 1 }];
        },
    };
    (numbers as any).dao = { getConnection: async () => connection };

    const result: any = await numbers.create({
        number_value: '+91 76939-76939',
        display_number: '76939 76939',
        category_id: 123,
        seller_id: 1,
        seller_type: 'ADMIN',
        serviceable_pin_codes: ['400001'],
        mrp: 5000,
        offer_price: 4000,
    });

    assert.equal(result.status, 1);
    assert.equal(result.data.number_id, 41);
    assert.ok(result.data.categories.some((category: any) => category.slug === 'customer-care-numbers'));
    assert.ok(result.data.categories.length > 1);
    assert.deepEqual(result.data.primary_category.match_spans, []);
    assert.equal(result.data.primary_category.sort_order, 1);
    assert.equal(result.data.classifier_version, CATEGORY_CLASSIFIER_VERSION);
    assert.match(result.data.deprecation_warning, /ignored/);
    assert.equal(began, 1);
    assert.equal(committed, 1);
    assert.equal(rolledBack, 0);
    assert.equal(released, 1);
    assert.match(sql.join('\n'), /DELETE FROM vip_number_categories/);
    assert.match(sql.join('\n'), /INSERT INTO vip_number_categories/);
    assert.match(sql.join('\n'), /INSERT INTO vip_number_subcategories/);
    assert.doesNotMatch(sql.find((statement) => statement.includes('INSERT INTO vip_numbers')) || '', /category_id/);
});

test('numbers/update locks the row and reclassifies a changed canonical number', async () => {
    const numbers = new Numbers();
    (numbers as any).prebooks = { reconcile: async () => undefined };
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const connection = {
        beginTransaction: async () => undefined,
        commit: async () => undefined,
        rollback: async () => undefined,
        release: () => undefined,
        query: async (sql: string, params?: any[]) => {
            calls.push({ sql, params });
            if (sql.includes('SELECT number_value')) {
                return [[{
                    number_value: '9193915915',
                    display_number: '9193 915 915',
                    mrp: 5000,
                    offer_price: 4000,
                }]];
            }
            return [{ affectedRows: 1 }];
        },
    };
    (numbers as any).dao = { getConnection: async () => connection };

    const result: any = await numbers.update({
        number_id: 7,
        owner_id: 2,
        number_value: '7693976939',
        display_number: '76939 76939',
        category_id: 99,
    });

    assert.equal(result.status, 1);
    assert.ok(result.data.categories.some((category: any) => category.slug === 'customer-care-numbers'));
    assert.ok(result.data.categories.length > 1);
    assert.deepEqual(result.data.primary_category.match_spans, []);
    assert.equal(result.data.classifier_version, CATEGORY_CLASSIFIER_VERSION);
    assert.match(calls[0].sql, /FOR UPDATE/);
    assert.deepEqual(calls[0].params, [7, 2]);
    const update = calls.find((call) => call.sql.includes('UPDATE vip_numbers'));
    assert.ok(update);
    assert.match(update!.sql, /number_value = \?/);
    assert.doesNotMatch(update!.sql, /category_id/);
    assert.ok(calls.some((call) => call.sql.includes('DELETE FROM vip_number_categories')));
});
