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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_DISCOUNT_KEY = void 0;
exports.normalizeGlobalDiscount = normalizeGlobalDiscount;
exports.discountedPrice = discountedPrice;
exports.readGlobalDiscount = readGlobalDiscount;
exports.GLOBAL_DISCOUNT_KEY = 'GLOBAL_NUMBER_DISCOUNT_PERCENT';
function normalizeGlobalDiscount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    return Math.min(99, Math.max(0, Math.round(parsed)));
}
function discountedPrice(mrpValue, discountValue) {
    const mrp = Math.max(0, Number(mrpValue) || 0);
    const discount = normalizeGlobalDiscount(discountValue);
    return Math.round((mrp * (100 - discount))) / 100;
}
function readGlobalDiscount(connection) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [rows] = yield connection.query('SELECT value FROM env WHERE key_id=? LIMIT 1', [exports.GLOBAL_DISCOUNT_KEY]);
        return normalizeGlobalDiscount((_a = rows === null || rows === void 0 ? void 0 : rows[0]) === null || _a === void 0 ? void 0 : _a.value);
    });
}
//# sourceMappingURL=globalPricing.js.map