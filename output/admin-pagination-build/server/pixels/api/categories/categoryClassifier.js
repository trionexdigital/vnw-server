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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_SLUGS = exports.CATEGORY_CATALOG = exports.CLASSIFIER_VERSION = exports.CATEGORY_CLASSIFIER_VERSION = void 0;
exports.normalizeIndianNumber = normalizeIndianNumber;
exports.isCategorySlug = isCategorySlug;
exports.resolveCategorySlug = resolveCategorySlug;
exports.getCategoryBySlug = getCategoryBySlug;
exports.getSubcategoryForCategory = getSubcategoryForCategory;
exports.inferCategorySelectionFromText = inferCategorySelectionFromText;
exports.categoryToApiModel = categoryToApiModel;
exports.categoryMatchToApiModel = categoryMatchToApiModel;
exports.classifyNumber = classifyNumber;
exports.decorateNumberCategories = decorateNumberCategories;
exports.syncNumberCategories = syncNumberCategories;
/** Store adapter for the internal app's category and subcategory matchers. */
const internalCategoryTaxonomy_1 = require("./internalCategoryTaxonomy");
exports.CATEGORY_CLASSIFIER_VERSION = 4;
exports.CLASSIFIER_VERSION = exports.CATEGORY_CLASSIFIER_VERSION;
exports.CATEGORY_CATALOG = internalCategoryTaxonomy_1.CATEGORY_TAXONOMY;
exports.CATEGORY_SLUGS = internalCategoryTaxonomy_1.CATEGORY_TAXONOMY.map(category => category.slug);
const bySlug = new Map(internalCategoryTaxonomy_1.CATEGORY_TAXONOMY.map(category => [category.slug, category]));
const byName = new Map(internalCategoryTaxonomy_1.CATEGORY_TAXONOMY.map(category => [category.name.toLowerCase(), category]));
function normalizeIndianNumber(input) {
    if (typeof input !== 'string' && typeof input !== 'number')
        throw new Error('A valid mobile number is required.');
    let value = String(input).trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(value))
        throw new Error('Mobile number may contain only digits and standard separators.');
    if (value.startsWith('+'))
        value = value.slice(1);
    if (value.length === 12 && value.startsWith('91'))
        value = value.slice(2);
    if (value.length === 11 && value.startsWith('0'))
        value = value.slice(1);
    if (!/^[6-9]\d{9}$/.test(value))
        throw new Error('Enter a valid 10-digit Indian mobile number.');
    return value;
}
function isCategorySlug(value) {
    return typeof value === 'string' && bySlug.has(value);
}
function resolveCategorySlug(value) {
    var _a, _b;
    if (typeof value !== 'string')
        return undefined;
    const cleaned = value.trim();
    return ((_a = bySlug.get(cleaned)) === null || _a === void 0 ? void 0 : _a.slug) || ((_b = byName.get(cleaned.toLowerCase())) === null || _b === void 0 ? void 0 : _b.slug);
}
function getCategoryBySlug(value) {
    return bySlug.get(resolveCategorySlug(value) || '');
}
function getSubcategoryForCategory(categorySlug, subcategoryId) {
    var _a;
    return (_a = bySlug.get(categorySlug)) === null || _a === void 0 ? void 0 : _a.subcategories.find(subcategory => subcategory.id === subcategoryId);
}
function searchWords(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function containsPhrase(haystack, phrase) {
    return phrase.length >= 3 && (` ${haystack} `).includes(` ${phrase} `);
}
/** Infer only exact, unambiguous taxonomy names; selected UI filters take precedence. */
function inferCategorySelectionFromText(query, preferredSlug) {
    const words = searchWords(query);
    const preferred = preferredSlug && bySlug.get(preferredSlug);
    const categoryHits = internalCategoryTaxonomy_1.CATEGORY_TAXONOMY.flatMap(category => {
        const phrases = [searchWords(category.name), searchWords(category.slug)];
        const length = Math.max(0, ...phrases.filter(phrase => containsPhrase(words, phrase)).map(phrase => phrase.length));
        return length ? [{ category, length }] : [];
    }).sort((a, b) => b.length - a.length);
    const namedCategory = categoryHits.length && (categoryHits.length === 1 || categoryHits[0].length > categoryHits[1].length)
        ? categoryHits[0].category : undefined;
    const parent = preferred || namedCategory;
    const possibleParents = parent ? [parent] : internalCategoryTaxonomy_1.CATEGORY_TAXONOMY;
    const subHits = possibleParents.flatMap(category => category.subcategories.flatMap(subcategory => {
        const phrase = searchWords(subcategory.name);
        if (phrase === searchWords(category.name) || !containsPhrase(words, phrase))
            return [];
        return [{ category, subcategory, length: phrase.length }];
    })).sort((a, b) => b.length - a.length);
    const child = subHits.length && (subHits.length === 1 || subHits[0].length > subHits[1].length)
        ? subHits[0] : undefined;
    return Object.assign(Object.assign({}, (parent || child ? { category: (parent || child.category).slug } : {})), (child ? { subcategory_id: child.subcategory.id } : {}));
}
function categoryToApiModel(category) {
    return {
        id: category.id,
        slug: category.slug,
        name: category.name,
        sort_order: internalCategoryTaxonomy_1.CATEGORY_TAXONOMY.indexOf(category) + 1,
        subcategories: category.subcategories.map(subcategory => (Object.assign({}, subcategory))),
    };
}
function categoryMatchToApiModel(category) {
    return Object.assign(Object.assign({}, category), { subcategories: category.subcategories.map(subcategory => (Object.assign({}, subcategory))), match_spans: [] });
}
function classifyNumber(input) {
    const canonicalNumber = normalizeIndianNumber(input);
    const matches = (0, internalCategoryTaxonomy_1.getMatchingCategories)(canonicalNumber);
    const categories = matches.map(({ category, subcategories }) => (Object.assign(Object.assign({}, categoryToApiModel(category)), { subcategories: subcategories.map(subcategory => (Object.assign({}, subcategory))), match_spans: [] })));
    return { canonicalNumber, categories, primaryCategory: categories[0] || null, classifierVersion: exports.CATEGORY_CLASSIFIER_VERSION };
}
function decorateNumberCategories(row, _categorySlugs) {
    var _a, _b, _c;
    const value = (_a = row.number_value) !== null && _a !== void 0 ? _a : row.display_number;
    const classification = value ? classifyNumber(value) : null;
    return Object.assign(Object.assign({}, row), { categories: (classification === null || classification === void 0 ? void 0 : classification.categories) || [], primary_category: (classification === null || classification === void 0 ? void 0 : classification.primaryCategory) || null, category_name: ((_b = classification === null || classification === void 0 ? void 0 : classification.primaryCategory) === null || _b === void 0 ? void 0 : _b.name) || null, category_slug: ((_c = classification === null || classification === void 0 ? void 0 : classification.primaryCategory) === null || _c === void 0 ? void 0 : _c.slug) || null, classifier_version: exports.CATEGORY_CLASSIFIER_VERSION });
}
/** Keep both browsing indexes in the same caller-owned transaction as the number. */
function syncNumberCategories(connection, numberId, numberValue) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!Number.isInteger(numberId) || numberId <= 0)
            throw new Error('A valid number ID is required.');
        const classification = classifyNumber(numberValue);
        yield connection.query('DELETE FROM vip_number_subcategories WHERE number_id = ?', [numberId]);
        yield connection.query('DELETE FROM vip_number_categories WHERE number_id = ?', [numberId]);
        // Use the exact same complete classification returned by detail and preview.
        // A child match also makes its parent browseable, even when the internal app's
        // independent broad matcher is narrower than that child matcher.
        const categorySlugs = classification.categories.map(category => category.slug);
        const subcategoryPairs = classification.categories.flatMap(category => category.subcategories.map(subcategory => [category.id, subcategory.id]));
        if (categorySlugs.length)
            yield connection.query(`INSERT INTO vip_number_categories (number_id, category_slug, classifier_version) VALUES ${categorySlugs.map(() => '(?,?,?)').join(',')}`, categorySlugs.flatMap(slug => [numberId, slug, exports.CATEGORY_CLASSIFIER_VERSION]));
        if (subcategoryPairs.length)
            yield connection.query(`INSERT INTO vip_number_subcategories (number_id, category_id, subcategory_id, classifier_version) VALUES ${subcategoryPairs.map(() => '(?,?,?,?)').join(',')}`, subcategoryPairs.flatMap(([categoryId, subcategoryId]) => [numberId, categoryId, subcategoryId, exports.CATEGORY_CLASSIFIER_VERSION]));
        return classification;
    });
}
//# sourceMappingURL=categoryClassifier.js.map