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
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const mysqlDao_1 = require("./mysqlDao");
function fakePool(rows, options = {}) {
    const calls = [];
    let commits = 0;
    let rollbacks = 0;
    return {
        calls,
        get commits() { return commits; },
        get rollbacks() { return rollbacks; },
        query(sql_1) {
            return __awaiter(this, arguments, void 0, function* (sql, params = []) {
                calls.push(sql);
                if (sql.includes('information_schema.STATISTICS'))
                    return [options.exclusive ? [{ INDEX_NAME: 'number_category_exclusive' }] : []];
                if (sql.includes('information_schema.TABLES'))
                    return [options.subTable === false ? [] : [{ TABLE_NAME: 'vip_number_subcategories' }]];
                if (sql.includes('SELECT number_id, number_value'))
                    return [rows.filter(row => row.number_id > Number(params[0])).slice(0, 100)];
                if (sql.includes('COUNT(*) AS total'))
                    return [[{ total: options.orphan && sql.includes('FROM vip_number_subcategories child') ? 1 : 0 }]];
                return [[]];
            });
        },
        getConnection() {
            return __awaiter(this, void 0, void 0, function* () {
                return {
                    beginTransaction: () => __awaiter(this, void 0, void 0, function* () { return undefined; }),
                    commit: () => __awaiter(this, void 0, void 0, function* () { commits += 1; }),
                    rollback: () => __awaiter(this, void 0, void 0, function* () { rollbacks += 1; }),
                    release: () => undefined,
                    query: (sql) => __awaiter(this, void 0, void 0, function* () {
                        calls.push(sql);
                        if (options.failInsert && sql.includes('INSERT INTO vip_number_categories'))
                            throw new Error('simulated insert failure');
                        return [[]];
                    }),
                };
            });
        },
    };
}
(0, node_test_1.default)('backfill refuses the old exclusive index or missing new table', () => __awaiter(void 0, void 0, void 0, function* () {
    yield strict_1.default.rejects(() => (0, mysqlDao_1.reconcileAutomaticNumberCategories)(fakePool([], { exclusive: true })), /SQLyog migration first/);
    yield strict_1.default.rejects(() => (0, mysqlDao_1.reconcileAutomaticNumberCategories)(fakePool([], { subTable: false })), /SQLyog migration first/);
}));
(0, node_test_1.default)('backfill verifies that every child has its indexed parent', () => __awaiter(void 0, void 0, void 0, function* () {
    const pool = fakePool([{ number_id: 4, number_value: '9000000000' }], { orphan: true });
    yield strict_1.default.rejects(() => (0, mysqlDao_1.reconcileAutomaticNumberCategories)(pool), /children without parents/);
}));
(0, node_test_1.default)('backfill preserves inventory and writes all derived mappings in a transaction', () => __awaiter(void 0, void 0, void 0, function* () {
    const pool = fakePool([{ number_id: 4, number_value: '9988998877' }]);
    strict_1.default.equal(yield (0, mysqlDao_1.reconcileAutomaticNumberCategories)(pool), 1);
    strict_1.default.equal(pool.commits, 1);
    strict_1.default.equal(pool.rollbacks, 0);
    strict_1.default.ok(pool.calls.some(sql => sql.includes('INSERT INTO vip_number_categories')));
    strict_1.default.ok(pool.calls.some(sql => sql.includes('INSERT INTO vip_number_subcategories')));
    strict_1.default.equal(pool.calls.some(sql => sql.includes('DELETE FROM vip_numbers')), false);
}));
(0, node_test_1.default)('an invalid number and failed mapping cannot be committed', () => __awaiter(void 0, void 0, void 0, function* () {
    const invalid = fakePool([{ number_id: 8, number_value: '12345' }]);
    yield strict_1.default.rejects(() => (0, mysqlDao_1.reconcileAutomaticNumberCategories)(invalid), /invalid vip_numbers IDs: 8/);
    strict_1.default.equal(invalid.commits, 0);
    const failing = fakePool([{ number_id: 9, number_value: '9988998877' }], { failInsert: true });
    yield strict_1.default.rejects(() => (0, mysqlDao_1.reconcileAutomaticNumberCategories)(failing), /simulated insert failure/);
    strict_1.default.equal(failing.rollbacks, 1);
    strict_1.default.equal(failing.commits, 0);
}));
(0, node_test_1.default)('number-facing runtime services contain no SQL against the retired category master', () => {
    const runtimeFiles = ['categories/categories.ts', 'numbers/numbers.ts', 'cart/cart.ts', 'wishlist/wishlist.ts', 'orders/orders.ts', 'sell/sell.ts'];
    const legacySql = /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?categories`?\b/i;
    for (const relativePath of runtimeFiles) {
        const source = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), 'src/server/pixels/api', relativePath), 'utf8');
        strict_1.default.doesNotMatch(source, legacySql);
    }
});
//# sourceMappingURL=automaticCategoryMigration.test.js.map