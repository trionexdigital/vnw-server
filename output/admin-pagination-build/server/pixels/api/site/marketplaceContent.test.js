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
const marketplaceContent_1 = require("./marketplaceContent");
(0, node_test_1.describe)('MarketplaceContent', () => {
    const number = (number_id, number_value, offer_price = 10000) => ({
        number_id, number_value, display_number: number_value, offer_price,
        status: 'AVAILABLE', stock: 1, rtp_status: 'RTP', is_featured: number_id % 2,
    });
    (0, node_test_1.it)('automatically creates mixed packs with live totals', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new marketplaceContent_1.MarketplaceContent();
        service.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
        service.dao = { executeQuery: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({ status: 1, rows: [
                        number(1, '9876500011', 12000), number(2, '9876600022', 18000), number(3, '9123400033'),
                    ] });
            }) };
        const response = yield service.packs({ pack_type: 'MIXED', size: 2 });
        strict_1.default.equal(response.status, 1);
        strict_1.default.equal(response.data[0].size, 2);
        strict_1.default.equal(response.data[0].total_price, 30000);
        strict_1.default.equal(response.data[0].is_available, true);
        strict_1.default.match(response.data[0].pack_id, /^AUTO-MIXED-/);
    }));
    (0, node_test_1.it)('matches series, start, end, and both-end packs from available numbers', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const cases = [
            { type: 'SERIES', rows: [number(1, '9000000001'), number(2, '9000000002')] },
            { type: 'SIMILAR_START', rows: [number(1, '9876500011'), number(2, '9876599912')] },
            { type: 'SIMILAR_END', rows: [number(1, '9123400011'), number(2, '9876500011')] },
            { type: 'SIMILAR_BOTH', rows: [number(1, '9876123411'), number(2, '9876567811')] },
        ];
        for (const current of cases) {
            const service = new marketplaceContent_1.MarketplaceContent();
            service.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
            service.dao = { executeQuery: () => __awaiter(void 0, void 0, void 0, function* () { return ({ status: 1, rows: current.rows }); }) };
            const response = yield service.packs({ pack_type: current.type, size: 2 });
            strict_1.default.equal(response.status, 1, current.type);
            strict_1.default.equal((_a = response.data[0]) === null || _a === void 0 ? void 0 : _a.size, 2, current.type);
            strict_1.default.equal((_b = response.data[0]) === null || _b === void 0 ? void 0 : _b.pack_type, current.type, current.type);
        }
    }));
    (0, node_test_1.it)('rejects pack sizes outside 2 to 10 before querying inventory', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new marketplaceContent_1.MarketplaceContent();
        service.prebooks = { reconcile: () => __awaiter(void 0, void 0, void 0, function* () { return undefined; }) };
        let queried = false;
        service.dao = { executeQuery: () => __awaiter(void 0, void 0, void 0, function* () { queried = true; return { status: 1, rows: [] }; }) };
        const response = yield service.packs({ pack_type: 'MIXED', size: 11 });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /between 2 and 10/);
        strict_1.default.equal(queried, false);
    }));
    (0, node_test_1.it)('publishes only active FAQs through the public feed', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new marketplaceContent_1.MarketplaceContent();
        let sql = '';
        service.dao = { executeQuery: (query) => __awaiter(void 0, void 0, void 0, function* () { sql = query; return { status: 1, rows: [] }; }) };
        const response = yield service.faqs(false);
        strict_1.default.equal(response.status, 1);
        strict_1.default.match(sql, /WHERE is_active = 1/);
    }));
    (0, node_test_1.it)('rejects unsafe trusted-client logo formats', () => __awaiter(void 0, void 0, void 0, function* () {
        const service = new marketplaceContent_1.MarketplaceContent();
        const response = yield service.clientUpload({ client_id: 3 }, { mimetype: 'image/svg+xml', data: Buffer.from('<svg/>') });
        strict_1.default.equal(response.status, -33);
        strict_1.default.match(response.info, /PNG, JPEG, or WebP/);
    }));
});
//# sourceMappingURL=marketplaceContent.test.js.map