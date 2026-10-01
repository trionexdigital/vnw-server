"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const categoryClassifier_1 = require("./categoryClassifier");
const internalCategoryTaxonomy_1 = require("./internalCategoryTaxonomy");
(0, node_test_1.default)('store taxonomy has the exact internal categories and ordered subcategories', () => {
    var _a;
    strict_1.default.equal(categoryClassifier_1.CATEGORY_CATALOG, internalCategoryTaxonomy_1.CATEGORY_TAXONOMY);
    strict_1.default.equal(categoryClassifier_1.CATEGORY_CATALOG.length, 31);
    strict_1.default.equal(categoryClassifier_1.CATEGORY_CATALOG.reduce((count, item) => count + item.subcategories.length, 0), 200);
    strict_1.default.equal((_a = (0, categoryClassifier_1.getSubcategoryForCategory)('doublling-aabbcc', 63)) === null || _a === void 0 ? void 0 : _a.name, '5 Couples');
});
(0, node_test_1.default)('classification preserves every internal match and subcategory', () => {
    var _a, _b;
    const mobile = '9988 998 877';
    const result = (0, categoryClassifier_1.classifyNumber)(mobile);
    const internal = (0, internalCategoryTaxonomy_1.getMatchingCategories)(mobile);
    strict_1.default.equal(result.canonicalNumber, '9988998877');
    strict_1.default.equal(result.classifierVersion, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
    strict_1.default.deepEqual(result.categories.map(item => item.id), internal.map(item => item.category.id));
    strict_1.default.deepEqual(result.categories.map(item => item.subcategories.map(sub => sub.id)), internal.map(item => item.subcategories.map(sub => sub.id)));
    strict_1.default.equal((_a = result.primaryCategory) === null || _a === void 0 ? void 0 : _a.name, (_b = internal[0]) === null || _b === void 0 ? void 0 : _b.category.name);
    strict_1.default.equal((0, categoryClassifier_1.decorateNumberCategories)({ number_value: mobile }).categories.length, internal.length);
});
(0, node_test_1.default)('every matching child also belongs to its parent, even when the broad matcher excludes it', () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const mobile = '9000000000';
    const mirror = (0, categoryClassifier_1.classifyNumber)(mobile).categories.find(category => category.slug === 'customer-care-numbers');
    strict_1.default.equal((0, internalCategoryTaxonomy_1.matchesCategory)(mobile, 16), false);
    strict_1.default.deepEqual(mirror === null || mirror === void 0 ? void 0 : mirror.subcategories.map(subcategory => subcategory.id), [5, 103]);
    const calls = [];
    yield (0, categoryClassifier_1.syncNumberCategories)({ query: (sql, params) => __awaiter(void 0, void 0, void 0, function* () { calls.push({ sql, params }); }) }, 41, mobile);
    const parent = calls.find(call => call.sql.includes('INSERT INTO vip_number_categories'));
    const children = calls.find(call => call.sql.includes('INSERT INTO vip_number_subcategories'));
    strict_1.default.ok((_a = parent.params) === null || _a === void 0 ? void 0 : _a.includes('customer-care-numbers'));
    strict_1.default.ok((_b = children.params) === null || _b === void 0 ? void 0 : _b.some((value, index, values) => value === 16 && values[index + 1] === 5));
    strict_1.default.ok((_c = children.params) === null || _c === void 0 ? void 0 : _c.some((value, index, values) => value === 16 && values[index + 1] === 103));
}));
(0, node_test_1.default)('text inference selects only unambiguous parent-scoped subcategories', () => {
    strict_1.default.deepEqual((0, categoryClassifier_1.inferCategorySelectionFromText)('show 3 Couples'), { category: 'doublling-aabbcc', subcategory_id: 52 });
    strict_1.default.deepEqual((0, categoryClassifier_1.inferCategorySelectionFromText)('show 5 Couples'), {});
    strict_1.default.deepEqual((0, categoryClassifier_1.inferCategorySelectionFromText)('Ulta-Pulta'), {});
    strict_1.default.deepEqual((0, categoryClassifier_1.inferCategorySelectionFromText)('Mirror Ulta-Pulta'), { category: 'customer-care-numbers', subcategory_id: 104 });
    strict_1.default.deepEqual((0, categoryClassifier_1.inferCategorySelectionFromText)('Mirror'), { category: 'customer-care-numbers' });
});
(0, node_test_1.default)('normalization and category/subcategory matching preserve internal semantics', () => {
    strict_1.default.equal((0, categoryClassifier_1.normalizeIndianNumber)('+91 9988 998 877'), '9988998877');
    strict_1.default.equal((0, internalCategoryTaxonomy_1.matchesCategory)('9988998877', 18), true);
    strict_1.default.equal((0, internalCategoryTaxonomy_1.matchesSubcategory)('9988998877', 63), true);
    strict_1.default.throws(() => (0, categoryClassifier_1.normalizeIndianNumber)('12345'));
});
(0, node_test_1.default)('sync writes all category memberships and parent-scoped subcategory memberships', () => __awaiter(void 0, void 0, void 0, function* () {
    const calls = [];
    const connection = { query: (sql, params) => __awaiter(void 0, void 0, void 0, function* () { calls.push({ sql, params }); }) };
    yield (0, categoryClassifier_1.syncNumberCategories)(connection, 7, '9988998877');
    strict_1.default.match(calls[0].sql, /DELETE FROM vip_number_subcategories/);
    strict_1.default.match(calls[1].sql, /DELETE FROM vip_number_categories/);
    const categories = calls.filter(call => /INSERT INTO vip_number_categories/.test(call.sql));
    const subcategories = calls.filter(call => /INSERT INTO vip_number_subcategories/.test(call.sql));
    strict_1.default.equal(categories.length, 1);
    strict_1.default.equal(subcategories.length, 1);
    strict_1.default.ok(categories[0].params.length > 3);
    strict_1.default.ok(subcategories[0].params.some((value, index, params) => value === 18 && params[index + 1] === 63));
}));
//# sourceMappingURL=categoryClassifier.test.js.map