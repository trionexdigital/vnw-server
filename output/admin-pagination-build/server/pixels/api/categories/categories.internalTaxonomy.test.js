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
const categories_1 = require("./categories");
(0, node_test_1.default)('category API returns internal hierarchy with live parent and subcategory counts', () => __awaiter(void 0, void 0, void 0, function* () {
    const categories = new categories_1.Categories();
    const queries = [];
    categories.dao = { executeQuery: (sql) => __awaiter(void 0, void 0, void 0, function* () {
            queries.push(sql);
            return ({
                status: 1,
                rows: sql.includes('vip_number_subcategories')
                    ? [{ category_id: 18, subcategory_id: 63, number_count: 2 }]
                    : [{ slug: 'doublling-aabbcc', number_count: 4 }],
            });
        }) };
    const response = yield categories.list();
    strict_1.default.equal(response.status, 1);
    strict_1.default.equal(response.data.length, 31);
    const doubling = response.data.find((category) => category.id === 18);
    strict_1.default.equal(doubling.number_count, 4);
    strict_1.default.equal(doubling.subcategories.find((subcategory) => subcategory.id === 63).number_count, 2);
    strict_1.default.equal(doubling.subcategories.find((subcategory) => subcategory.id === 158).number_count, 0);
    for (const sql of queries) {
        strict_1.default.match(sql, /COUNT\(DISTINCT/);
        strict_1.default.match(sql, /n\.status = 'AVAILABLE'/);
        strict_1.default.match(sql, /n\.visibility_type\s*=\s*'ONLINE'/);
        strict_1.default.match(sql, /n\.stock > 0/);
    }
}));
//# sourceMappingURL=categories.internalTaxonomy.test.js.map