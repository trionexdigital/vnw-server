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
const node_test_1 = require("node:test");
const dealsOfDay_1 = require("./dealsOfDay");
const number = {
    number_id: 1,
    number_value: '9695951155',
    display_number: '969595 1155',
    seller_id: 1,
    seller_type: 'ADMIN',
    title_label: 'Numerology Special',
    badge: 'PREMIUM',
    mrp: 349999,
    offer_price: 259999,
    discount_pct: 25,
    numerology_sum: 5,
    operator: 'Any',
    description: 'Highly desirable',
    stock: 1,
    status: 'AVAILABLE',
    is_featured: 1,
    views: 10,
    created_at: '2026-01-01',
};
function serviceWithQueries(results) {
    const service = new dealsOfDay_1.DealsOfDay();
    const calls = [];
    service.dao = {
        executeQuery: (sql, params) => __awaiter(this, void 0, void 0, function* () {
            calls.push({ sql, params });
            const next = results.shift();
            if (!next)
                throw new Error('Unexpected query');
            return next;
        }),
    };
    return { service, calls };
}
(0, node_test_1.describe)('DealsOfDay', () => {
    (0, node_test_1.it)('returns eligible curated entries without consulting the fallback catalog', () => __awaiter(void 0, void 0, void 0, function* () {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [Object.assign(Object.assign({}, number), { deal_id: 7, hero_label: 'Premium Pick', sort_order: 0, is_active: 1 })] },
        ]);
        const response = yield service.publicList();
        strict_1.default.equal(response.status, 1);
        strict_1.default.equal(response.data.source, 'CURATED');
        strict_1.default.equal(response.data.items[0].deal_id, 7);
        strict_1.default.equal(response.data.items[0].hero_label, 'Premium Pick');
        strict_1.default.equal(calls.length, 1);
        strict_1.default.match(calls[0].sql, /n\.status = 'AVAILABLE'/);
    }));
    (0, node_test_1.it)('uses featured available numbers when the curated list is empty', () => __awaiter(void 0, void 0, void 0, function* () {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [] },
            { status: 1, rows: [Object.assign(Object.assign({}, number), { deal_id: null, hero_label: null, sort_order: null, is_active: 1 })] },
        ]);
        const response = yield service.publicList();
        strict_1.default.equal(response.status, 1);
        strict_1.default.equal(response.data.source, 'FEATURED_FALLBACK');
        strict_1.default.equal(response.data.items[0].deal_id, null);
        strict_1.default.equal(calls.length, 2);
        strict_1.default.match(calls[1].sql, /n\.is_featured = 1/);
    }));
    (0, node_test_1.it)('uses newest available numbers when no featured numbers qualify', () => __awaiter(void 0, void 0, void 0, function* () {
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [] },
            { status: 1, rows: [] },
            { status: 1, rows: [Object.assign(Object.assign({}, number), { number_id: 2, is_featured: 0 })] },
        ]);
        const response = yield service.publicList();
        strict_1.default.equal(response.status, 1);
        strict_1.default.equal(response.data.source, 'FEATURED_FALLBACK');
        strict_1.default.equal(response.data.items[0].number_id, 2);
        strict_1.default.equal(calls.length, 3);
        strict_1.default.match(calls[2].sql, /ORDER BY n\.created_at DESC/);
        strict_1.default.match(calls[2].sql, /n\.status = 'AVAILABLE' AND n\.stock > 0/);
    }));
    (0, node_test_1.it)('rejects selecting the same catalog number twice', () => __awaiter(void 0, void 0, void 0, function* () {
        const { service } = serviceWithQueries([
            { status: 1, rows: [{ number_id: 1 }] },
            { status: 1, rows: [{ deal_id: 9 }] },
        ]);
        const response = yield service.save({ number_id: 1, is_active: true });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /already in Lucky Pick of the Day/);
    }));
    (0, node_test_1.it)('trims hero overrides and appends a new deal after the current ordering', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        const { service, calls } = serviceWithQueries([
            { status: 1, rows: [{ number_id: 1 }] },
            { status: 1, rows: [] },
            { status: 1, insertId: 14 },
        ]);
        const response = yield service.save({
            number_id: 1,
            hero_label: `  ${'L'.repeat(80)}  `,
            hero_description: `  ${'D'.repeat(190)}  `,
            is_active: false,
        });
        strict_1.default.equal(response.status, 1);
        strict_1.default.equal(response.data.deal_id, 14);
        strict_1.default.equal((_a = calls[2].params) === null || _a === void 0 ? void 0 : _a[1].length, 64);
        strict_1.default.equal((_b = calls[2].params) === null || _b === void 0 ? void 0 : _b[2].length, 160);
        strict_1.default.equal((_c = calls[2].params) === null || _c === void 0 ? void 0 : _c[3], 0);
        strict_1.default.match(calls[2].sql, /COALESCE\(MAX\(sort_order\), -1\) \+ 1/);
    }));
    (0, node_test_1.it)('reorders every configured entry in one transaction', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new dealsOfDay_1.DealsOfDay();
        const updates = [];
        let committed = false;
        let rolledBack = false;
        let released = false;
        service.dao = {
            getConnection: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
                    query: (sql, params) => __awaiter(void 0, void 0, void 0, function* () {
                        if (sql.startsWith('SELECT'))
                            return [[{ deal_id: 11 }, { deal_id: 12 }, { deal_id: 13 }]];
                        if (params)
                            updates.push(params);
                        return [{}];
                    }),
                    commit: () => __awaiter(void 0, void 0, void 0, function* () { committed = true; }),
                    rollback: () => __awaiter(void 0, void 0, void 0, function* () { rolledBack = true; }),
                    release: () => { released = true; },
                });
            }),
        };
        const response = yield service.reorder({ deal_ids: [13, 11, 12] });
        strict_1.default.equal(response.status, 1);
        strict_1.default.deepEqual(updates, [[0, 13], [1, 11], [2, 12]]);
        strict_1.default.equal(committed, true);
        strict_1.default.equal(rolledBack, false);
        strict_1.default.equal(released, true);
    }));
    (0, node_test_1.it)('rolls back a stale ordering without partially updating rows', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new dealsOfDay_1.DealsOfDay();
        let updateCount = 0;
        let rolledBack = false;
        service.dao = {
            getConnection: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
                    query: (sql) => __awaiter(void 0, void 0, void 0, function* () {
                        if (sql.startsWith('SELECT'))
                            return [[{ deal_id: 11 }, { deal_id: 12 }]];
                        updateCount += 1;
                        return [{}];
                    }),
                    commit: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
                    rollback: () => __awaiter(void 0, void 0, void 0, function* () { rolledBack = true; }),
                    release: () => undefined,
                });
            }),
        };
        const response = yield service.reorder({ deal_ids: [11, 13] });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /ordering is stale/);
        strict_1.default.equal(updateCount, 0);
        strict_1.default.equal(rolledBack, true);
    }));
    (0, node_test_1.it)('removes only the deal entry', () => __awaiter(void 0, void 0, void 0, function* () {
        const { service, calls } = serviceWithQueries([
            { status: 1, affectedRows: 1 },
        ]);
        const response = yield service.remove({ deal_id: 7 });
        strict_1.default.equal(response.status, 1);
        strict_1.default.match(calls[0].sql, /DELETE FROM deal_of_day_numbers/);
        strict_1.default.doesNotMatch(calls[0].sql, /vip_numbers/);
        strict_1.default.deepEqual(calls[0].params, [7]);
    }));
});
//# sourceMappingURL=dealsOfDay.test.js.map