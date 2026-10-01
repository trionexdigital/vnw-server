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
exports.Dashboard = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
class Dashboard {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Buyer dashboard summary: order stats, wishlist count, referral earnings, recent orders. */
    summary(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const uid = payload.user_id;
                const statsQ = yield this.dao.executeQuery(`SELECT COUNT(*) AS total_orders,
                        SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) AS paid_orders,
                        COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) AS total_spent
                 FROM orders WHERE user_id = ?`, [uid]);
                const wishQ = yield this.dao.executeQuery(`SELECT COUNT(*) AS c FROM wishlist WHERE user_id = ?`, [uid]);
                const cartQ = yield this.dao.executeQuery(`SELECT COUNT(*) AS c FROM cart_items ci JOIN carts c ON c.cart_id = ci.cart_id WHERE c.user_id = ?`, [uid]);
                const refQ = yield this.dao.executeQuery(`SELECT COALESCE(SUM(amount),0) AS earned FROM referral_earnings WHERE user_id = ?`, [uid]);
                const recentQ = yield this.dao.executeQuery(`SELECT order_id, order_no, total, status, payment_status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`, [uid]);
                const s = ((_a = statsQ.rows) === null || _a === void 0 ? void 0 : _a[0]) || {};
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    total_orders: Number(s.total_orders) || 0,
                    paid_orders: Number(s.paid_orders) || 0,
                    total_spent: Number(s.total_spent) || 0,
                    wishlist_count: Number((_c = (_b = wishQ.rows) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.c) || 0,
                    cart_count: Number((_e = (_d = cartQ.rows) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.c) || 0,
                    referral_earned: Number((_g = (_f = refQ.rows) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.earned) || 0,
                    recent_orders: recentQ.rows || [],
                };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
}
exports.Dashboard = Dashboard;
//# sourceMappingURL=dashboard.js.map