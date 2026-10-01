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
const privateLinks_1 = require("./privateLinks");
const numbers_1 = require("../numbers/numbers");
(0, node_test_1.describe)('private number links', () => {
    (0, node_test_1.it)('generates opaque tokens and stores deterministic hashes', () => {
        const left = (0, privateLinks_1.generatePrivateToken)();
        const right = (0, privateLinks_1.generatePrivateToken)();
        strict_1.default.notEqual(left, right);
        strict_1.default.ok(left.length >= 40);
        strict_1.default.equal((0, privateLinks_1.hashPrivateToken)(left), (0, privateLinks_1.hashPrivateToken)(left));
        strict_1.default.notEqual((0, privateLinks_1.hashPrivateToken)(left), left);
        strict_1.default.match((0, privateLinks_1.hashPrivateToken)(left), /^[a-f0-9]{64}$/);
    });
    (0, node_test_1.it)('binds validation to the requested number and active token hash', () => __awaiter(void 0, void 0, void 0, function* () {
        const token = (0, privateLinks_1.generatePrivateToken)();
        let captured = [];
        const connection = { query: (_sql, params) => __awaiter(void 0, void 0, void 0, function* () { captured = params; return [[{ private_link_id: 7, name: 'Private stock' }]]; }) };
        const link = yield (0, privateLinks_1.resolvePrivateLinkWithConnection)(connection, token, 42);
        strict_1.default.equal(link.private_link_id, 7);
        strict_1.default.deepEqual(captured, [42, (0, privateLinks_1.hashPrivateToken)(token)]);
    }));
    (0, node_test_1.it)('adds the Online visibility boundary to every public catalog listing', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new numbers_1.Numbers();
        const sql = [];
        service.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
        service.dao = { executeQuery: (query) => __awaiter(void 0, void 0, void 0, function* () {
                sql.push(query);
                return query.includes('COUNT(*)') ? { status: 1, rows: [{ total: 0 }] } : { status: 1, rows: [] };
            }) };
        const response = yield service.list({});
        strict_1.default.equal(response.status, 1);
        strict_1.default.ok(sql.some((query) => /visibility_type\s*=\s*'ONLINE'/.test(query)));
    }));
});
//# sourceMappingURL=privateLinks.test.js.map