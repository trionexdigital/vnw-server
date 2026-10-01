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
const admin_1 = require("./admin");
(0, node_test_1.default)('admin orders apply the same filters to count and page queries', () => __awaiter(void 0, void 0, void 0, function* () {
    const calls = [];
    const admin = new admin_1.Admin();
    admin.dao = { executeQuery: (sql, params) => __awaiter(void 0, void 0, void 0, function* () {
            calls.push({ sql, params });
            return { rows: sql.includes('COUNT(*)') ? [{ total: 42 }] : [{ order_id: 7 }] };
        }) };
    const response = yield admin.ordersList({ status: 'paid', q: 'VNW', page: 3, limit: 15 });
    strict_1.default.equal(response.status, 1);
    strict_1.default.deepEqual(response.data, { items: [{ order_id: 7 }], total: 42, page: 3, limit: 15, pages: 3 });
    strict_1.default.match(calls[0].sql, /o\.status = \?.*o\.order_no LIKE \?/);
    strict_1.default.deepEqual(calls[0].params, ['PAID', '%VNW%']);
    strict_1.default.deepEqual(calls[1].params, ['PAID', '%VNW%', 15, 30]);
}));
(0, node_test_1.default)('admin users cap page size and bind search filters with offset', () => __awaiter(void 0, void 0, void 0, function* () {
    const calls = [];
    const admin = new admin_1.Admin();
    admin.dao = { executeQuery: (sql, params) => __awaiter(void 0, void 0, void 0, function* () {
            calls.push({ sql, params });
            return { rows: sql.includes('COUNT(*)') ? [{ total: 250 }] : [{ user_id: 9 }] };
        }) };
    const response = yield admin.usersList({ role: 'dealer', q: 'Ali', page: 2, limit: 1000 });
    strict_1.default.equal(response.status, 1);
    strict_1.default.deepEqual(response.data, { items: [{ user_id: 9 }], total: 250, page: 2, limit: 100, pages: 3 });
    strict_1.default.deepEqual(calls[0].params, ['DEALER', '%Ali%', '%Ali%', '%Ali%']);
    strict_1.default.deepEqual(calls[1].params.slice(-2), [100, 100]);
}));
//# sourceMappingURL=admin.pagination.test.js.map