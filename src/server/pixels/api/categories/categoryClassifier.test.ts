import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CATEGORY_CATALOG,
    CATEGORY_CLASSIFIER_VERSION,
    CATEGORY_REFERENCE_VECTORS,
    CATEGORY_SLUGS,
    CategorySlug,
    classifyNumber,
    decorateNumberCategories,
    matchNumberCategory,
    normalizeIndianNumber,
    resolveCategorySlug,
} from './categoryClassifier';
import { Categories } from './categories';

test('normalizes supported Indian mobile-number formatting', () => {
    assert.equal(normalizeIndianNumber('+91 (91939) 15915'), '9193915915');
    assert.equal(normalizeIndianNumber('91-91939-15915'), '9193915915');
    assert.equal(normalizeIndianNumber('91939.15915'), '9193915915');
    assert.throws(() => normalizeIndianNumber('5193915915'), /valid 10-digit Indian mobile number/);
    assert.throws(() => normalizeIndianNumber('91939A15915'), /only digits/);
});

test('v2 catalog contains every supported slug exactly once', () => {
    assert.equal(CATEGORY_CLASSIFIER_VERSION, 2);
    assert.equal(CATEGORY_CATALOG.length, 24);
    assert.deepEqual(new Set(CATEGORY_CATALOG.map((item) => item.slug)), new Set(CATEGORY_SLUGS));
});

for (const category of CATEGORY_CATALOG) {
    test(`${category.name} matcher evidence follows its reference vectors`, () => {
        const vectors = CATEGORY_REFERENCE_VECTORS[category.slug];
        for (const positiveNumber of vectors.positive) {
            const positive = matchNumberCategory(positiveNumber, category.slug);
            assert.ok(positive, `${positiveNumber} should match ${category.slug}`);
            for (const span of positive.match_spans) {
                assert.ok(Number.isInteger(span.start));
                assert.ok(Number.isInteger(span.end));
                assert.ok(span.start >= 0 && span.start < span.end && span.end <= 10);
            }
        }
        for (const negativeNumber of vectors.negative) {
            assert.equal(
                matchNumberCategory(negativeNumber, category.slug),
                undefined,
                `${negativeNumber} should not match ${category.slug}`,
            );
        }
    });
}

const EXCLUSIVE_WINNER_VECTORS: ReadonlyArray<readonly [CategorySlug, string]> = [
    ['without-248-numbers', '9653107539'],
    ['mirror-numbers', '7693976939'],
    ['semi-mirror-numbers', '6005646005'],
    ['two-digit-numbers', '6969669699'],
    ['three-digit-numbers', '9070907709'],
    ['counting-numbers', '9505152978'],
    ['786-numbers', '9178605032'],
    ['108-numbers', '9510873064'],
    ['doubling-numbers', '9911223344'],
    ['ab-ab-xy-xy-numbers', '9191878765'],
    ['ab-ab-ab-numbers', '9191912345'],
    ['start-ab-ab-numbers', '9191406385'],
    ['middle-ab-ab-numbers', '9060032323'],
    ['ending-ab-ab-numbers', '9060481010'],
    ['abc-abc-abc-numbers', '9129129123'],
    ['abc-abc-numbers', '9129123456'],
    ['aaa-bbb-numbers', '9777666123'],
    ['triple-numbers', '9006136333'],
    ['tetra-numbers', '9777712345'],
    ['penta-numbers', '9777771234'],
    ['hexa-numbers', '9777777123'],
    ['septa-numbers', '9777777712'],
    ['octa-numbers', '9777777771'],
    ['unique-numbers', '9650741832'],
];

test('each catalog category can be the one exclusive winner', () => {
    assert.equal(EXCLUSIVE_WINNER_VECTORS.length, CATEGORY_SLUGS.length);
    for (const [expectedSlug, number] of EXCLUSIVE_WINNER_VECTORS) {
        const result = classifyNumber(number);
        assert.equal(result.categories.length, 1, number);
        assert.equal(result.primaryCategory.slug, expectedSlug, number);
        assert.equal(result.categories[0], result.primaryCategory);
    }
});

test('every published catalog example resolves back to its displayed category', () => {
    for (const category of CATEGORY_CATALOG) {
        for (const example of category.examples) {
            assert.equal(classifyNumber(example).primaryCategory.slug, category.slug, `${category.slug}: ${example}`);
        }
    }
});

test('seven storefront reference numbers select the expected category and exact spans', () => {
    const vectors: ReadonlyArray<readonly [string, CategorySlug, Array<{ start: number, end: number }>]> = [
        ['9006136333', 'triple-numbers', [{ start: 7, end: 10 }]],
        ['9060481010', 'ending-ab-ab-numbers', [{ start: 6, end: 10 }]],
        ['9006859696', 'ending-ab-ab-numbers', [{ start: 6, end: 10 }]],
        ['9006622121', 'doubling-numbers', [{ start: 1, end: 3 }, { start: 3, end: 5 }, { start: 5, end: 7 }]],
        ['9060032323', 'middle-ab-ab-numbers', [{ start: 5, end: 9 }]],
        ['7070700852', 'ab-ab-ab-numbers', [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }]],
        ['9991926234', 'triple-numbers', [{ start: 0, end: 3 }]],
    ];
    for (const [number, slug, spans] of vectors) {
        const result = classifyNumber(number);
        assert.equal(result.primaryCategory.slug, slug, number);
        assert.deepEqual(result.primaryCategory.match_spans, spans, number);
    }
});

test('specificity scoring and kind tie-order are deterministic', () => {
    // Whole-number Two Digit (10 explained digits) beats shorter structures.
    assert.equal(classifyNumber('6969669699').primaryCategory.slug, 'two-digit-numbers');
    // Mirror explains all ten digits and wins its score tie as a structural rule.
    assert.equal(classifyNumber('6966996696').primaryCategory.slug, 'mirror-numbers');
    // Doubling and a four-digit run both score six; structural wins over repeat.
    assert.equal(classifyNumber('9999661732').primaryCategory.slug, 'doubling-numbers');
    // Triple scores five (3 + 2) and beats an equally long Counting match by kind.
    assert.equal(classifyNumber('9991234506').primaryCategory.slug, 'triple-numbers');
    // Equal literal scores fall back to the existing category priority.
    assert.equal(classifyNumber('9178610843').primaryCategory.slug, '786-numbers');
});

test('longest repeat selects only the strongest eligible tier and uses run plus two scoring', () => {
    const result = classifyNumber('9777777771');
    assert.equal(result.categories.length, 1);
    assert.equal(result.primaryCategory.slug, 'octa-numbers');
    assert.deepEqual(result.primaryCategory.match_spans, [{ start: 1, end: 9 }]);

    const repeatWinsEqualCountingScore = classifyNumber('9991234506');
    assert.equal(repeatWinsEqualCountingScore.primaryCategory.slug, 'triple-numbers');
});

test('counting evidence preserves each term of the longest contiguous sequence', () => {
    assert.deepEqual(
        matchNumberCategory('9505152978', 'counting-numbers')?.match_spans,
        [{ start: 1, end: 3 }, { start: 3, end: 5 }, { start: 5, end: 7 }],
    );
    assert.deepEqual(
        matchNumberCategory('9678950374', 'counting-numbers')?.match_spans,
        [{ start: 1, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 4 }, { start: 4, end: 5 }],
    );
});

test('aliases resolve and decorated rows expose one snake-case API match', () => {
    assert.equal(resolveCategorySlug('Mirror'), 'mirror-numbers');
    for (const category of CATEGORY_CATALOG) {
        for (const alias of category.aliases) assert.equal(resolveCategorySlug(alias), category.slug);
    }
    const row = decorateNumberCategories({ number_id: 7, number_value: '7693976939' });
    assert.equal(row.categories.length, 1);
    assert.equal(row.primary_category.slug, 'mirror-numbers');
    assert.equal(row.category_slug, 'mirror-numbers');
    assert.equal(row.category_name, 'Mirror Numbers');
    assert.deepEqual(row.primary_category.match_spans, [{ start: 0, end: 5 }, { start: 5, end: 10 }]);
    assert.equal(row.primary_category.sort_order, 2);
    assert.equal('sortOrder' in row.primary_category, false);
});

test('decorator honors an explicit historical primary only when number evidence is unavailable', () => {
    const row = decorateNumberCategories(
        { number_id: 7, primary_category: { slug: '108-numbers' } },
        ['mirror-numbers', '786-numbers'],
    );
    assert.equal(row.categories.length, 1);
    assert.equal(row.primary_category.slug, '108-numbers');
    assert.deepEqual(row.primary_category.match_spans, []);
});

test('categories/classify returns the same exclusive snake-case match shape', async () => {
    const response: any = await new Categories().classify({ number: '9006622121' });
    assert.equal(response.status, 1);
    assert.equal(response.data.classifier_version, 2);
    assert.equal(response.data.categories.length, 1);
    assert.deepEqual(response.data.categories[0], response.data.primary_category);
    assert.equal(response.data.primary_category.slug, 'doubling-numbers');
    assert.deepEqual(response.data.primary_category.match_spans, [
        { start: 1, end: 3 },
        { start: 3, end: 5 },
        { start: 5, end: 7 },
    ]);
    assert.equal(response.data.primary_category.sort_order, 9);
    assert.equal('sortOrder' in response.data.primary_category, false);
});
