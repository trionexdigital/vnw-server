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
const numbers_1 = require("./numbers");
const numberSearch_1 = require("./numberSearch");
function queryResult(rows = []) {
    return { status: 1, info: 'SUCCESS', rows, fetchedRows: rows.length };
}
(0, node_test_1.default)('structured predicates bind every user value instead of interpolating SQL', () => {
    const compiled = (0, numberSearch_1.compileStructuredSearch)({
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
    strict_1.default.doesNotMatch(sql, /786|98\?\?|%55|digit.?7/i);
    strict_1.default.ok(compiled.params.includes('98%'));
    strict_1.default.ok(compiled.params.includes('%786%'));
    strict_1.default.ok(compiled.params.includes('%55'));
    strict_1.default.ok(compiled.params.includes('98__5_____'));
    strict_1.default.ok(compiled.params.includes('7'));
    strict_1.default.ok(compiled.params.includes(45));
    strict_1.default.match(sql, /NOT LIKE \?/);
    strict_1.default.match(sql, /CHAR_LENGTH/);
    strict_1.default.match(sql, /SUBSTRING/);
});
(0, node_test_1.default)('all supported pattern presets compile for either number edge', () => {
    const presets = [
        'double', 'triple', 'tetra', 'penta', 'hexa', 'counting',
        'doubling', 'abc_abc', 'ab_ab', 'mirror', 'semi_mirror',
    ];
    presets.forEach((preset) => {
        const starts = (0, numberSearch_1.compileStructuredSearch)({ starts_with_pattern: preset });
        const ends = (0, numberSearch_1.compileStructuredSearch)({ ends_with_pattern: preset });
        strict_1.default.equal(starts.where.length, 1, `${preset} starts predicate`);
        strict_1.default.equal(ends.where.length, 1, `${preset} ends predicate`);
    });
});
(0, node_test_1.default)('structured validation rejects invalid masks, sums, duplicate frequency digits and ranges', () => {
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({ exact_mask: '98??' }), /exact_mask/);
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({ digit_sum: 91 }), /digit_sum/);
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({ mid_sum: 18 }), /mid_sum/);
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({ score_sum: 0 }), /score_sum/);
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({
        digit_frequencies: [{ digit: 7, min: 2 }, { digit: 7, max: 3 }],
    }), /only be used once/);
    strict_1.default.throws(() => (0, numberSearch_1.normalizeStructuredSearch)({
        digit_frequencies: [{ digit: 7, min: 5, max: 2 }],
    }), /cannot exceed/);
    strict_1.default.throws(() => (0, numberSearch_1.validatePrice)(1000001, 'price_max'), /10,00,000/);
});
(0, node_test_1.default)('AI output sanitizer retains only validated schema values', () => {
    const filters = (0, numberSearch_1.sanitizeAiFilters)({
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
    strict_1.default.equal(filters.q, '9876');
    strict_1.default.equal(filters.price_min, 1501);
    strict_1.default.equal(filters.badge, 'RARE');
    strict_1.default.equal(filters.sort, 'price_asc');
    strict_1.default.deepEqual(filters.search, {
        anywhere: '786',
        digit_frequencies: [{ digit: 7, min: 2 }],
    });
    strict_1.default.equal(filters.injected_sql, undefined);
});
(0, node_test_1.default)('deterministic AI fallback understands common English and Hinglish constraints', () => {
    const numbers = new numbers_1.Numbers();
    const parsed = numbers.localAiFilters('mirror number akhir mein 786, digit 7 3 baar, root sum 9, 30k tak');
    strict_1.default.equal(parsed.filters.search.ends_with, '786');
    strict_1.default.deepEqual(parsed.filters.search.digit_frequencies, [{ digit: 7, min: 3 }]);
    strict_1.default.equal(parsed.filters.search.score_sum, 9);
    strict_1.default.equal(parsed.filters.price_max, 30000);
    strict_1.default.match(parsed.explanation, /786/);
});
(0, node_test_1.default)('AI search preserves a selected child and combines it with price and digit filters', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    let listing;
    numbers.openAiFilters = () => __awaiter(void 0, void 0, void 0, function* () { return ({ filters: { category: 'customer-care-numbers', sort: 'popular' }, explanation: 'Mirror pattern' }); });
    numbers.list = (payload) => __awaiter(void 0, void 0, void 0, function* () { listing = payload; return { status: 1, info: 'OK', data: { items: [], total: 0 } }; });
    const response = yield numbers.aiSearch({
        query: 'Mirror Ulta-Pulta',
        category: 'customer-care-numbers',
        subcategory_id: 104,
        price_min: 1500,
        price_max: 3000,
        search: { anywhere: '786' },
        page: 2,
    });
    strict_1.default.equal(response.status, 1);
    strict_1.default.equal(listing.category, 'customer-care-numbers');
    strict_1.default.equal(listing.subcategory_id, 104);
    strict_1.default.equal(listing.price_min, 1500);
    strict_1.default.equal(listing.price_max, 3000);
    strict_1.default.equal(listing.search.anywhere, '786');
    strict_1.default.equal(listing.page, 2);
}));
(0, node_test_1.default)('AI text infers a unique child but leaves shared child names unselected', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    const listings = [];
    numbers.openAiFilters = () => __awaiter(void 0, void 0, void 0, function* () { return null; });
    numbers.list = (payload) => __awaiter(void 0, void 0, void 0, function* () { listings.push(payload); return { status: 1, info: 'OK', data: { items: [], total: 0 } }; });
    yield numbers.aiSearch({ query: 'show 3 Couples' });
    yield numbers.aiSearch({ query: 'Ulta-Pulta' });
    strict_1.default.deepEqual([listings[0].category, listings[0].subcategory_id], ['doublling-aabbcc', 52]);
    strict_1.default.equal(listings[1].subcategory_id, undefined);
}));
(0, node_test_1.default)('numbers/list combines category, price and structured predicates with AND', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const calls = [];
    numbers.dao = {
        executeQuery: (sql_1, ...args_1) => __awaiter(void 0, [sql_1, ...args_1], void 0, function* (sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*)'))
                return queryResult([{ total: 0 }]);
            return queryResult([]);
        }),
    };
    const result = yield numbers.list({
        category: 'customer-care-numbers',
        price_min: 1501,
        price_max: 3000,
        search: { starts_with: '98', must_contain: ['786'] },
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.match(calls[0].sql, /vip_number_categories/);
    strict_1.default.match(calls[0].sql, /offer_price >= \?/);
    strict_1.default.match(calls[0].sql, /offer_price <= \?/);
    strict_1.default.match(calls[0].sql, /LIKE \?[\s\S]*AND[\s\S]*LIKE \?/);
    strict_1.default.ok(calls[0].params.includes('customer-care-numbers'));
    strict_1.default.ok(calls[0].params.includes(1501));
    strict_1.default.ok(calls[0].params.includes('98%'));
}));
(0, node_test_1.default)('closest matches relax one transparent condition and cap each group at six', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    numbers.dao = {
        executeQuery: (sql) => __awaiter(void 0, void 0, void 0, function* () {
            const hasMask = sql.includes('LIKE ?');
            if (sql.includes('COUNT(*)'))
                return queryResult([{ total: hasMask ? 0 : 8 }]);
            if (hasMask)
                return queryResult([]);
            return queryResult(Array.from({ length: 8 }, (_, index) => ({
                number_id: index + 1,
                number_value: `98765000${String(index + 10).slice(-2)}`,
                display_number: `98765 000${String(index + 10).slice(-2)}`,
                status: 'AVAILABLE',
                offer_price: 2500,
            })));
        }),
    };
    const result = yield numbers.list({
        search: { exact_mask: '98??5?????', include_alternatives: true },
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.data.total, 0);
    strict_1.default.equal(result.data.alternatives.length, 1);
    strict_1.default.equal(result.data.alternatives[0].relaxed_key, 'exact_mask');
    strict_1.default.match(result.data.alternatives[0].label, /exact position mask/i);
    strict_1.default.equal(result.data.alternatives[0].items.length, 6);
}));
(0, node_test_1.default)('closest matches relax a child before its parent without sending a child without a category', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    const attempted = [];
    numbers.queryListing = (payload) => __awaiter(void 0, void 0, void 0, function* () {
        attempted.push(payload);
        return { items: [], total: 0, page: 1, limit: 6, pages: 0 };
    });
    yield numbers.findAlternatives({ category: 'customer-care-numbers', subcategory_id: 104, search: {} });
    strict_1.default.equal(attempted[0].category, 'customer-care-numbers');
    strict_1.default.equal(attempted[0].subcategory_id, undefined);
    strict_1.default.equal(attempted[1].category, undefined);
    strict_1.default.equal(attempted[1].subcategory_id, undefined);
}));
(0, node_test_1.default)('alternatives are absent when exact results exist', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    numbers.dao = {
        executeQuery: (sql) => __awaiter(void 0, void 0, void 0, function* () {
            return sql.includes('COUNT(*)')
                ? queryResult([{ total: 1 }])
                : queryResult([{
                        number_id: 1,
                        number_value: '9876543210',
                        display_number: '98765 43210',
                        status: 'AVAILABLE',
                    }]);
        }),
    };
    const result = yield numbers.list({
        search: { anywhere: '786', include_alternatives: true },
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.data.total, 1);
    strict_1.default.equal('alternatives' in result.data, false);
}));
//# sourceMappingURL=numbers.search.test.js.map