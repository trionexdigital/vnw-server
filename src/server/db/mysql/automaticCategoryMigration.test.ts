import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcileAutomaticNumberCategories } from './mysqlDao';

function fakePool(rows: Array<{ number_id: number; number_value: string }>, options: { exclusive?: boolean; subTable?: boolean; failInsert?: boolean; orphan?: boolean } = {}) {
  const calls: string[] = [];
  let commits = 0;
  let rollbacks = 0;
  return {
    calls,
    get commits() { return commits; },
    get rollbacks() { return rollbacks; },
    async query(sql: string, params: any[] = []): Promise<any> {
      calls.push(sql);
      if (sql.includes('information_schema.STATISTICS')) return [options.exclusive ? [{ INDEX_NAME: 'number_category_exclusive' }] : []];
      if (sql.includes('information_schema.TABLES')) return [options.subTable === false ? [] : [{ TABLE_NAME: 'vip_number_subcategories' }]];
      if (sql.includes('SELECT number_id, number_value')) return [rows.filter(row => row.number_id > Number(params[0])).slice(0, 100)];
      if (sql.includes('COUNT(*) AS total')) return [[{ total: options.orphan && sql.includes('FROM vip_number_subcategories child') ? 1 : 0 }]];
      return [[]];
    },
    async getConnection() {
      return {
        beginTransaction: async () => undefined,
        commit: async () => { commits += 1; },
        rollback: async () => { rollbacks += 1; },
        release: () => undefined,
        query: async (sql: string) => {
          calls.push(sql);
          if (options.failInsert && sql.includes('INSERT INTO vip_number_categories')) throw new Error('simulated insert failure');
          return [[]];
        },
      };
    },
  };
}

test('backfill refuses the old exclusive index or missing new table', async () => {
  await assert.rejects(() => reconcileAutomaticNumberCategories(fakePool([], { exclusive: true })), /SQLyog migration first/);
  await assert.rejects(() => reconcileAutomaticNumberCategories(fakePool([], { subTable: false })), /SQLyog migration first/);
});

test('backfill verifies that every child has its indexed parent', async () => {
  const pool = fakePool([{ number_id: 4, number_value: '9000000000' }], { orphan: true });
  await assert.rejects(() => reconcileAutomaticNumberCategories(pool), /children without parents/);
});

test('backfill preserves inventory and writes all derived mappings in a transaction', async () => {
  const pool = fakePool([{ number_id: 4, number_value: '9988998877' }]);
  assert.equal(await reconcileAutomaticNumberCategories(pool), 1);
  assert.equal(pool.commits, 1);
  assert.equal(pool.rollbacks, 0);
  assert.ok(pool.calls.some(sql => sql.includes('INSERT INTO vip_number_categories')));
  assert.ok(pool.calls.some(sql => sql.includes('INSERT INTO vip_number_subcategories')));
  assert.equal(pool.calls.some(sql => sql.includes('DELETE FROM vip_numbers')), false);
});

test('an invalid number and failed mapping cannot be committed', async () => {
  const invalid = fakePool([{ number_id: 8, number_value: '12345' }]);
  await assert.rejects(() => reconcileAutomaticNumberCategories(invalid), /invalid vip_numbers IDs: 8/);
  assert.equal(invalid.commits, 0);
  const failing = fakePool([{ number_id: 9, number_value: '9988998877' }], { failInsert: true });
  await assert.rejects(() => reconcileAutomaticNumberCategories(failing), /simulated insert failure/);
  assert.equal(failing.rollbacks, 1);
  assert.equal(failing.commits, 0);
});

test('number-facing runtime services contain no SQL against the retired category master', () => {
  const runtimeFiles = ['categories/categories.ts', 'numbers/numbers.ts', 'cart/cart.ts', 'wishlist/wishlist.ts', 'orders/orders.ts', 'sell/sell.ts'];
  const legacySql = /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?categories`?\b/i;
  for (const relativePath of runtimeFiles) {
    const source = readFileSync(resolve(process.cwd(), 'src/server/pixels/api', relativePath), 'utf8');
    assert.doesNotMatch(source, legacySql);
  }
});
