import assert from 'node:assert/strict';
import test from 'node:test';
import { Categories } from './categories';

test('category API returns internal hierarchy with live parent and subcategory counts', async () => {
  const categories = new Categories();
  const queries: string[] = [];
  (categories as any).dao = { executeQuery: async (sql: string) => { queries.push(sql); return ({
    status: 1,
    rows: sql.includes('vip_number_subcategories')
      ? [{ category_id: 18, subcategory_id: 63, number_count: 2 }]
      : [{ slug: 'doublling-aabbcc', number_count: 4 }],
  }); } };
  const response: any = await categories.list();
  assert.equal(response.status, 1);
  assert.equal(response.data.length, 31);
  const doubling = response.data.find((category: any) => category.id === 18);
  assert.equal(doubling.number_count, 4);
  assert.equal(doubling.subcategories.find((subcategory: any) => subcategory.id === 63).number_count, 2);
  assert.equal(doubling.subcategories.find((subcategory: any) => subcategory.id === 158).number_count, 0);
  for (const sql of queries) {
    assert.match(sql, /COUNT\(DISTINCT/);
    assert.match(sql, /n\.status = 'AVAILABLE'/);
    assert.match(sql, /n\.visibility_type\s*=\s*'ONLINE'/);
    assert.match(sql, /n\.stock > 0/);
  }
});
