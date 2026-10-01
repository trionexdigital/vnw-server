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
const dealerPurchases_1 = require("./dealerPurchases");
(0, node_test_1.describe)('dealer purchase validation', () => {
    (0, node_test_1.it)('rejects duplicate numbers before starting a transaction', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new dealerPurchases_1.DealerPurchases();
        let connected = false;
        service.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () { connected = true; throw new Error('should not connect'); }) };
        const response = yield service.create({ user_id: 1, external_dealer_id: 2, numbers: '9876543210\n9876543210', visibility_type: 'ONLINE', purchase_price: 100, intended_sale_price: 200 });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /duplicate/i);
        strict_1.default.equal(connected, false);
    }));
    (0, node_test_1.it)('requires a private collection for Offline dealer inventory', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new dealerPurchases_1.DealerPurchases();
        let connected = false;
        service.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () { connected = true; throw new Error('should not connect'); }) };
        const response = yield service.create({ user_id: 1, external_dealer_id: 2, numbers: '9876543210', visibility_type: 'OFFLINE', purchase_price: 100, intended_sale_price: 200 });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /private collection/i);
        strict_1.default.equal(connected, false);
    }));
    (0, node_test_1.it)('rejects supplier overpayments and rolls back', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new dealerPurchases_1.DealerPurchases();
        let rolledBack = false;
        service.dao = { getConnection: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    beginTransaction: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }),
                    query: (sql) => __awaiter(void 0, void 0, void 0, function* () {
                        if (sql.includes('COALESCE(SUM(purchase_price)'))
                            return [[{ billed: '1000.00', paid: '800.00' }]];
                        throw new Error(`Unexpected query: ${sql}`);
                    }),
                    commit: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }), rollback: () => __awaiter(void 0, void 0, void 0, function* () { rolledBack = true; }), release: () => undefined,
                });
            }) };
        const response = yield service.recordPayment({ user_id: 1, external_dealer_id: 2, amount: 250, paid_at: '2026-09-22 10:00:00' });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /exceeds the remaining/i);
        strict_1.default.equal(rolledBack, true);
    }));
});
//# sourceMappingURL=dealerPurchases.test.js.map