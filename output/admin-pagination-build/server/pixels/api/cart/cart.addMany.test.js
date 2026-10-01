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
const cart_1 = require("./cart");
(0, node_test_1.describe)('Cart.addMany', () => {
    (0, node_test_1.it)('adds a complete available pack in one transaction', () => __awaiter(void 0, void 0, void 0, function* () {
        const cart = new cart_1.Cart();
        const inserted = [];
        let committed = false;
        const connection = {
            beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
            query: (sql, params) => __awaiter(void 0, void 0, void 0, function* () {
                if (sql.includes('FROM vip_numbers'))
                    return [[
                            { number_id: 1, display_number: '9000 000 001', status: 'AVAILABLE', stock: 1, rtp_status: 'RTP' },
                            { number_id: 2, display_number: '9000 000 002', status: 'AVAILABLE', stock: 1, rtp_status: 'RTA' },
                        ]];
                if (sql.includes('FROM carts'))
                    return [[{ cart_id: 7 }]];
                if (sql.startsWith('INSERT IGNORE INTO cart_items')) {
                    inserted.push(Number(params[1]));
                    return [{}];
                }
                throw new Error(`Unexpected query: ${sql}`);
            }),
            commit: () => __awaiter(void 0, void 0, void 0, function* () { committed = true; }), rollback: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }), release: () => undefined,
        };
        let listQuery = 0;
        cart.dao = {
            getConnection: () => __awaiter(void 0, void 0, void 0, function* () { return connection; }),
            executeQuery: () => __awaiter(void 0, void 0, void 0, function* () { return (++listQuery === 1 ? { status: 1, fetchedRows: 1, rows: [{ cart_id: 7 }] } : { status: 1, rows: [] }); }),
        };
        cart.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
        const response = yield cart.addMany({ user_id: 9, number_ids: [1, 2] });
        strict_1.default.equal(response.status, 1);
        strict_1.default.deepEqual(inserted, [1, 2]);
        strict_1.default.equal(committed, true);
    }));
    (0, node_test_1.it)('rolls back without inserts when any pack number is unavailable', () => __awaiter(void 0, void 0, void 0, function* () {
        const cart = new cart_1.Cart();
        let rolledBack = false;
        let inserts = 0;
        cart.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
                    query: (sql) => __awaiter(void 0, void 0, void 0, function* () {
                        if (sql.includes('FROM vip_numbers'))
                            return [[
                                    { number_id: 1, display_number: '9000 000 001', status: 'AVAILABLE', stock: 1, rtp_status: 'RTP' },
                                    { number_id: 2, display_number: '9000 000 002', status: 'SOLD', stock: 0, rtp_status: 'RTP' },
                                ]];
                        inserts += 1;
                        return [{}];
                    }),
                    commit: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }), rollback: () => __awaiter(void 0, void 0, void 0, function* () { rolledBack = true; }), release: () => undefined,
                });
            }) };
        cart.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
        const response = yield cart.addMany({ user_id: 9, number_ids: [1, 2] });
        strict_1.default.equal(response.status, -33);
        strict_1.default.equal(inserts, 0);
        strict_1.default.equal(rolledBack, true);
    }));
});
//# sourceMappingURL=cart.addMany.test.js.map