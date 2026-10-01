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
const similarNumbers_1 = require("./similarNumbers");
const source = {
    number_id: 1,
    number_value: '9193999999',
    display_number: '9193 999 999',
    offer_price: 100000,
    numerology_sum: 3,
    status: 'AVAILABLE',
    stock: 1,
    views: 5,
    created_at: '2026-01-01T00:00:00.000Z',
};
function candidate(overrides) {
    return Object.assign({ number_id: 2, number_value: '9193888888', display_number: '9193 888 888', offer_price: 110000, numerology_sum: 3, status: 'AVAILABLE', stock: 1, views: 1, created_at: '2026-01-02T00:00:00.000Z' }, overrides);
}
(0, node_test_1.default)('similar score prioritizes automatic category and visible digit resemblance', () => {
    const strongPattern = candidate({ number_id: 2, number_value: '9193999988', display_number: '9193 999 988' });
    const weakPattern = candidate({ number_id: 3, number_value: '7000000003', display_number: '7000 000 003', offer_price: 100000 });
    const strongScore = (0, similarNumbers_1.scoreSimilarNumber)(source, strongPattern);
    const weakScore = (0, similarNumbers_1.scoreSimilarNumber)(source, weakPattern);
    strict_1.default.ok(strongScore.prefixLength > weakScore.prefixLength);
    strict_1.default.ok(strongScore.positionalMatches > weakScore.positionalMatches);
    strict_1.default.ok(strongScore.score > weakScore.score);
});
(0, node_test_1.default)('similar ranking uses numerology, price, popularity, recency and id as stable tie breakers', () => {
    const numerologyAndPrice = candidate({ number_id: 10, offer_price: 101000, numerology_sum: 3 });
    const differentNumerology = candidate({ number_id: 11, offer_price: 101000, numerology_sum: 8 });
    strict_1.default.equal((0, similarNumbers_1.rankSimilarNumbers)(source, [differentNumerology, numerologyAndPrice])[0].number_id, 10);
    const older = candidate({ number_id: 12, views: 9, created_at: '2025-01-01T00:00:00.000Z' });
    const newer = candidate({ number_id: 13, views: 9, created_at: '2026-01-01T00:00:00.000Z' });
    strict_1.default.equal((0, similarNumbers_1.rankSimilarNumbers)(source, [older, newer])[0].number_id, 13);
    const lowerId = candidate({ number_id: 14, views: 9 });
    const higherId = candidate({ number_id: 15, views: 9 });
    strict_1.default.equal((0, similarNumbers_1.rankSimilarNumbers)(source, [lowerId, higherId])[0].number_id, 15);
});
(0, node_test_1.default)('similar ranking excludes source, unavailable and zero-stock candidates', () => {
    const ranked = (0, similarNumbers_1.rankSimilarNumbers)(source, [
        candidate({ number_id: 1 }),
        candidate({ number_id: 2, status: 'SOLD' }),
        candidate({ number_id: 3, stock: 0 }),
        candidate({ number_id: 4 }),
    ]);
    strict_1.default.deepEqual(ranked.map((item) => item.number_id), [4]);
});
(0, node_test_1.default)('numbers/similar returns stable pagination from a bounded candidate pool', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    const calls = [];
    numbers.dao = {
        executeQuery: (sql_1, ...args_1) => __awaiter(void 0, [sql_1, ...args_1], void 0, function* (sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('WHERE n.number_id = ? LIMIT 1')) {
                return { status: 1, rows: [source], fetchedRows: 1 };
            }
            return {
                status: 1,
                rows: [
                    candidate({ number_id: 2, number_value: '9193999998' }),
                    candidate({ number_id: 3, number_value: '9193999988' }),
                    candidate({ number_id: 4, number_value: '9193999888' }),
                ],
                fetchedRows: 3,
            };
        }),
    };
    const result = yield numbers.similar({ number_id: 1, page: 2, limit: 1 });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.data.source.number_id, 1);
    strict_1.default.equal(result.data.total, 3);
    strict_1.default.equal(result.data.page, 2);
    strict_1.default.equal(result.data.limit, 1);
    strict_1.default.equal(result.data.pages, 3);
    strict_1.default.equal(result.data.items.length, 1);
    strict_1.default.match(calls[1].sql, /n\.status = 'AVAILABLE' AND n\.stock > 0/);
    strict_1.default.match(calls[1].sql, /LIMIT 600/);
    strict_1.default.deepEqual(calls[1].params.slice(0, 1 + result.data.source.categories.length), [1, ...result.data.source.categories.map((category) => category.slug)]);
}));
(0, node_test_1.default)('numbers/similar rejects missing and unknown source IDs', () => __awaiter(void 0, void 0, void 0, function* () {
    const numbers = new numbers_1.Numbers();
    numbers.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
    numbers.dao = {
        executeQuery: () => __awaiter(void 0, void 0, void 0, function* () { return ({ status: 1, rows: [], fetchedRows: 0 }); }),
    };
    const missing = yield numbers.similar({ number_id: 0 });
    strict_1.default.equal(missing.status, -33);
    strict_1.default.match(missing.info, /number_id is required/);
    const unknown = yield numbers.similar({ number_id: 999 });
    strict_1.default.equal(unknown.status, -33);
    strict_1.default.match(unknown.info, /Number not found/);
}));
//# sourceMappingURL=similarNumbers.test.js.map