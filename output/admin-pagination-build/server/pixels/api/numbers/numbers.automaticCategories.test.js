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
const categoryClassifier_1 = require("../categories/categoryClassifier");
function queryResult(rows = []) {
    return { status: 1, info: 'SUCCESS', rows, fetchedRows: rows.length };
}
(0, node_test_1.default)('numbers/list rejects anything except a catalog category slug', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    let queried = false;
    numbers.dao = {
        executeQuery: () => __awaiter(void 0, void 0, void 0, function* () {
            queried = true;
            return queryResult();
        }),
    };
    const result = yield numbers.list({ category: '1' });
    strict_1.default.equal(result.status, -33);
    strict_1.default.match(result.info, /Unknown category slug: 1/);
    strict_1.default.equal(queried, false);
}));
(0, node_test_1.default)('numbers/list validates parent-scoped subcategories and uses the subcategory index', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const calls = [];
    numbers.dao = { executeQuery: (sql_1, ...args_1) => __awaiter(void 0, [sql_1, ...args_1], void 0, function* (sql, params = []) {
            calls.push({ sql, params });
            return sql.includes('COUNT(*)') ? queryResult([{ total: 0 }]) : queryResult([]);
        }) };
    const invalid = yield numbers.list({ category: 'doublling-aabbcc', subcategory_id: 84 });
    strict_1.default.equal(invalid.status, -33);
    strict_1.default.equal(calls.length, 0);
    const valid = yield numbers.list({ category: 'doublling-aabbcc', subcategory_id: 63 });
    strict_1.default.equal(valid.status, 1);
    strict_1.default.match(calls[0].sql, /vip_number_subcategories/);
    strict_1.default.doesNotMatch(calls[0].sql, /vip_number_categories/);
    strict_1.default.deepEqual(calls[0].params.slice(1, 4), [18, 63, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
}));
(0, node_test_1.default)('numbers/list filters through the derived index and returns all matching categories and subcategories', () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const calls = [];
    numbers.dao = {
        executeQuery: (sql_1, ...args_1) => __awaiter(void 0, [sql_1, ...args_1], void 0, function* (sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*)'))
                return queryResult([{ total: 1 }]);
            return queryResult([{
                    number_id: 9,
                    number_value: '7693976939',
                    display_number: '76939 76939',
                    mrp: 20000,
                    offer_price: 15000,
                    status: 'AVAILABLE',
                }]);
        }),
    };
    const result = yield numbers.list({ category: 'customer-care-numbers', page: 2, limit: 12 });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.data.total, 1);
    strict_1.default.equal(result.data.page, 2);
    strict_1.default.ok(result.data.items[0].categories.some((category) => category.slug === 'customer-care-numbers'));
    strict_1.default.equal(result.data.items[0].category_slug, (_a = result.data.items[0].primary_category) === null || _a === void 0 ? void 0 : _a.slug);
    strict_1.default.ok(result.data.items[0].categories.length > 1);
    strict_1.default.deepEqual(result.data.items[0].primary_category.match_spans, []);
    strict_1.default.equal(result.data.items[0].primary_category.sort_order, 1);
    strict_1.default.equal('sortOrder' in result.data.items[0].primary_category, false);
    strict_1.default.match(calls[0].sql, /vip_number_categories/);
    strict_1.default.doesNotMatch(calls[0].sql, /JOIN\s+categories/i);
    strict_1.default.equal(calls[0].params[1], 'customer-care-numbers');
    strict_1.default.equal(calls[0].params[2], categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
    strict_1.default.deepEqual(calls[1].params.slice(-2), [12, 12]);
}));
(0, node_test_1.default)('numbers/create classifies in the same transaction and ignores legacy category_id', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const sql = [];
    let began = 0;
    let committed = 0;
    let rolledBack = 0;
    let released = 0;
    const connection = {
        beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { began += 1; }),
        commit: () => __awaiter(void 0, void 0, void 0, function* () { committed += 1; }),
        rollback: () => __awaiter(void 0, void 0, void 0, function* () { rolledBack += 1; }),
        release: () => { released += 1; },
        query: (statement) => __awaiter(void 0, void 0, void 0, function* () {
            sql.push(statement);
            if (statement.includes('INSERT INTO vip_numbers'))
                return [{ insertId: 41 }];
            return [{ affectedRows: 1 }];
        }),
    };
    numbers.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () { return connection; }) };
    const result = yield numbers.create({
        number_value: '+91 76939-76939',
        display_number: '76939 76939',
        category_id: 123,
        seller_id: 1,
        seller_type: 'ADMIN',
        mrp: 5000,
        offer_price: 4000,
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.data.number_id, 41);
    strict_1.default.ok(result.data.categories.some((category) => category.slug === 'customer-care-numbers'));
    strict_1.default.ok(result.data.categories.length > 1);
    strict_1.default.deepEqual(result.data.primary_category.match_spans, []);
    strict_1.default.equal(result.data.primary_category.sort_order, 1);
    strict_1.default.equal(result.data.classifier_version, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
    strict_1.default.match(result.data.deprecation_warning, /ignored/);
    strict_1.default.equal(began, 1);
    strict_1.default.equal(committed, 1);
    strict_1.default.equal(rolledBack, 0);
    strict_1.default.equal(released, 1);
    strict_1.default.match(sql.join('\n'), /DELETE FROM vip_number_categories/);
    strict_1.default.match(sql.join('\n'), /INSERT INTO vip_number_categories/);
    strict_1.default.match(sql.join('\n'), /INSERT INTO vip_number_subcategories/);
    strict_1.default.doesNotMatch(sql.find((statement) => statement.includes('INSERT INTO vip_numbers')) || '', /category_id/);
}));
(0, node_test_1.default)('numbers/update locks the row and reclassifies a changed canonical number', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const calls = [];
    const connection = {
        beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
        commit: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
        rollback: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
        release: () => undefined,
        query: (sql, params) => __awaiter(void 0, void 0, void 0, function* () {
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
        }),
    };
    numbers.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () { return connection; }) };
    const result = yield numbers.update({
        number_id: 7,
        owner_id: 2,
        number_value: '7693976939',
        display_number: '76939 76939',
        category_id: 99,
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.ok(result.data.categories.some((category) => category.slug === 'customer-care-numbers'));
    strict_1.default.ok(result.data.categories.length > 1);
    strict_1.default.deepEqual(result.data.primary_category.match_spans, []);
    strict_1.default.equal(result.data.classifier_version, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
    strict_1.default.match(calls[0].sql, /FOR UPDATE/);
    strict_1.default.deepEqual(calls[0].params, [7, 2]);
    const update = calls.find((call) => call.sql.includes('UPDATE vip_numbers'));
    strict_1.default.ok(update);
    strict_1.default.match(update.sql, /number_value = \?/);
    strict_1.default.doesNotMatch(update.sql, /category_id/);
    strict_1.default.ok(calls.some((call) => call.sql.includes('DELETE FROM vip_number_categories')));
}));
//# sourceMappingURL=numbers.automaticCategories.test.js.map