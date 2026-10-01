import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_CATALOG, CATEGORY_CLASSIFIER_VERSION, classifyNumber, decorateNumberCategories, getSubcategoryForCategory, inferCategorySelectionFromText, normalizeIndianNumber, syncNumberCategories } from './categoryClassifier';
import { CATEGORY_TAXONOMY, getMatchingCategories, matchesCategory, matchesSubcategory } from './internalCategoryTaxonomy';

test('store taxonomy has the exact internal categories and ordered subcategories', () => {
  assert.equal(CATEGORY_CATALOG, CATEGORY_TAXONOMY);
  assert.equal(CATEGORY_CATALOG.length, 31);
  assert.equal(CATEGORY_CATALOG.reduce((count, item) => count + item.subcategories.length, 0), 200);
  assert.equal(getSubcategoryForCategory('doublling-aabbcc', 63)?.name, '5 Couples');
});

test('classification preserves every internal match and subcategory', () => {
  const mobile = '9988 998 877';
  const result = classifyNumber(mobile);
  const internal = getMatchingCategories(mobile);
  assert.equal(result.canonicalNumber, '9988998877');
  assert.equal(result.classifierVersion, CATEGORY_CLASSIFIER_VERSION);
  assert.deepEqual(result.categories.map(item => item.id), internal.map(item => item.category.id));
  assert.deepEqual(result.categories.map(item => item.subcategories.map(sub => sub.id)), internal.map(item => item.subcategories.map(sub => sub.id)));
  assert.equal(result.primaryCategory?.name, internal[0]?.category.name);
  assert.equal(decorateNumberCategories({ number_value: mobile }).categories.length, internal.length);
});

test('every matching child also belongs to its parent, even when the broad matcher excludes it', async () => {
  const mobile = '9000000000';
  const mirror = classifyNumber(mobile).categories.find(category => category.slug === 'customer-care-numbers');
  assert.equal(matchesCategory(mobile, 16), false);
  assert.deepEqual(mirror?.subcategories.map(subcategory => subcategory.id), [5, 103]);
  const calls: Array<{ sql: string; params?: any[] }> = [];
  await syncNumberCategories({ query: async (sql, params) => { calls.push({ sql, params }); } }, 41, mobile);
  const parent = calls.find(call => call.sql.includes('INSERT INTO vip_number_categories'))!;
  const children = calls.find(call => call.sql.includes('INSERT INTO vip_number_subcategories'))!;
  assert.ok(parent.params?.includes('customer-care-numbers'));
  assert.ok(children.params?.some((value, index, values) => value === 16 && values[index + 1] === 5));
  assert.ok(children.params?.some((value, index, values) => value === 16 && values[index + 1] === 103));
});

test('text inference selects only unambiguous parent-scoped subcategories', () => {
  assert.deepEqual(inferCategorySelectionFromText('show 3 Couples'), { category: 'doublling-aabbcc', subcategory_id: 52 });
  assert.deepEqual(inferCategorySelectionFromText('show 5 Couples'), {});
  assert.deepEqual(inferCategorySelectionFromText('Ulta-Pulta'), {});
  assert.deepEqual(inferCategorySelectionFromText('Mirror Ulta-Pulta'), { category: 'customer-care-numbers', subcategory_id: 104 });
  assert.deepEqual(inferCategorySelectionFromText('Mirror'), { category: 'customer-care-numbers' });
});

test('normalization and category/subcategory matching preserve internal semantics', () => {
  assert.equal(normalizeIndianNumber('+91 9988 998 877'), '9988998877');
  assert.equal(matchesCategory('9988998877', 18), true);
  assert.equal(matchesSubcategory('9988998877', 63), true);
  assert.throws(() => normalizeIndianNumber('12345'));
});

test('sync writes all category memberships and parent-scoped subcategory memberships', async () => {
  const calls: Array<{ sql: string; params?: any[] }> = [];
  const connection = { query: async (sql: string, params?: any[]) => { calls.push({ sql, params }); } };
  await syncNumberCategories(connection, 7, '9988998877');
  assert.match(calls[0].sql, /DELETE FROM vip_number_subcategories/);
  assert.match(calls[1].sql, /DELETE FROM vip_number_categories/);
  const categories = calls.filter(call => /INSERT INTO vip_number_categories/.test(call.sql));
  const subcategories = calls.filter(call => /INSERT INTO vip_number_subcategories/.test(call.sql));
  assert.equal(categories.length, 1);
  assert.equal(subcategories.length, 1);
  assert.ok(categories[0].params!.length > 3);
  assert.ok(subcategories[0].params!.some((value, index, params) => value === 18 && params[index + 1] === 63));
});
