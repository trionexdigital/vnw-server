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
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const prebooks_1 = require("./prebooks");
const categoryClassifier_1 = require("../categories/categoryClassifier");
(0, node_test_1.default)('converts India midnight to the matching UTC instant', () => {
    strict_1.default.equal((0, prebooks_1.istDateToUtc)('2026-08-15'), '2026-08-14 18:30:00');
});
(0, node_test_1.default)('rejects malformed RTP dates', () => {
    strict_1.default.throws(() => (0, prebooks_1.istDateToUtc)('15/08/2026'), /valid RTP availability date/);
});
(0, node_test_1.default)('48-hour cancellation is eligible through the exact boundary only', () => {
    const deadline = '2026-08-05 10:00:00';
    strict_1.default.equal((0, prebooks_1.isCancellationEligible)(deadline, new Date('2026-08-05T09:59:59.999Z')), true);
    strict_1.default.equal((0, prebooks_1.isCancellationEligible)(deadline, new Date('2026-08-05T10:00:00.000Z')), true);
    strict_1.default.equal((0, prebooks_1.isCancellationEligible)(deadline, new Date('2026-08-05T10:00:00.001Z')), false);
});
(0, node_test_1.default)('pre-book filters validate the parent and scope the child with other filters', () => __awaiter(void 0, void 0, void 0, function* () {
    const prebooks = new prebooks_1.Prebooks();
    prebooks.reconcile = () => __awaiter(void 0, void 0, void 0, function* () { return undefined; });
    const calls = [];
    prebooks.dao = { executeQuery: (sql_1, ...args_1) => __awaiter(void 0, [sql_1, ...args_1], void 0, function* (sql, params = []) {
            calls.push({ sql, params });
            return { status: 1, rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [] };
        }) };
    const invalid = yield prebooks.catalog({ category: 'customer-care-numbers', subcategory_id: 63 });
    strict_1.default.equal(invalid.status, -33);
    strict_1.default.equal(calls.length, 0);
    const valid = yield prebooks.catalog({ category: 'customer-care-numbers', subcategory_id: 104, price_min: 1500, page: 2, limit: 12 });
    strict_1.default.equal(valid.status, 1);
    strict_1.default.match(calls[0].sql, /vip_number_subcategories/);
    strict_1.default.ok(calls[0].params.includes(categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION));
    strict_1.default.ok(calls[0].params.includes(1500));
    strict_1.default.deepEqual(calls[1].params.slice(-2), [12, 12]);
}));
//# sourceMappingURL=prebooks.test.js.map