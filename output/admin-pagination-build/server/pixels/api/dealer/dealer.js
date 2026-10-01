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
exports.Dealer = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const numbers_1 = require("../numbers/numbers");
const wallet_1 = require("../wallet/wallet");
const categoryClassifier_1 = require("../categories/categoryClassifier");
class Dealer {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
        this.numbers = new numbers_1.Numbers();
        this.wallet = new wallet_1.Wallet();
    }
    dashboard(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const did = payload.user_id;
                const listQ = yield this.dao.executeQuery(`SELECT
                    COUNT(*) AS total_listings,
                    SUM(status='AVAILABLE') AS available,
                    SUM(status='PENDING_APPROVAL') AS pending,
                    SUM(status='SOLD') AS sold
                 FROM vip_numbers WHERE seller_id = ?`, [did]);
                const salesQ = yield this.dao.executeQuery(`SELECT COALESCE(SUM(oi.price),0) AS gross, COALESCE(SUM(oi.commission_amount),0) AS commission, COUNT(*) AS units
                 FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
                 WHERE oi.seller_id = ? AND o.payment_status = 'PAID'`, [did]);
                const s = ((_a = listQ.rows) === null || _a === void 0 ? void 0 : _a[0]) || {};
                const sl = ((_b = salesQ.rows) === null || _b === void 0 ? void 0 : _b[0]) || {};
                const gross = Number(sl.gross) || 0;
                const commission = Number(sl.commission) || 0;
                const walletBalance = yield (0, wallet_1.getBalance)(did);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    total_listings: Number(s.total_listings) || 0,
                    available: Number(s.available) || 0,
                    pending: Number(s.pending) || 0,
                    sold: Number(s.sold) || 0,
                    units_sold: Number(sl.units) || 0,
                    gross_sales: gross,
                    commission,
                    net_earnings: Number((gross - commission).toFixed(2)),
                    wallet_balance: walletBalance,
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
    listings(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.numbers.list({ seller_id: payload.user_id, status: 'ALL', limit: 60, sort: 'newest' });
        });
    }
    /** Dealer creates a listing → enters PENDING_APPROVAL for admin review. */
    createListing(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.numbers.create(Object.assign(Object.assign({}, payload), { seller_id: payload.user_id, seller_type: 'DEALER', status: 'PENDING_APPROVAL', is_featured: 0 }));
        });
    }
    updateListing(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            // Scope update to the dealer's own listings; force back to review if pricing/number changed.
            return this.numbers.update(Object.assign(Object.assign({}, payload), { owner_id: payload.user_id }));
        });
    }
    deleteListing(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.numbers.remove({ number_id: payload.number_id, owner_id: payload.user_id });
        });
    }
    sales(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT oi.order_item_id, oi.display_number, oi.price, oi.commission_amount, oi.item_status,
                        COALESCE(n.number_value, oi.display_number) AS number_value,
                        o.order_no, o.created_at, o.payment_status
                 FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
                 LEFT JOIN vip_numbers n ON n.number_id = oi.number_id
                 WHERE oi.seller_id = ? ORDER BY o.created_at DESC`, [payload.user_id]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = (q.rows || []).map((row) => {
                    try {
                        return (0, categoryClassifier_1.decorateNumberCategories)(row);
                    }
                    catch (_a) {
                        return (0, categoryClassifier_1.decorateNumberCategories)(row, ['unique-numbers']);
                    }
                });
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
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
    getProfile(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT * FROM dealer_profiles WHERE dealer_id = ?`, [payload.user_id]);
                if (q.fetchedRows === 0) {
                    yield this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id) VALUES (?)`, [payload.user_id]);
                    const q2 = yield this.dao.executeQuery(`SELECT * FROM dealer_profiles WHERE dealer_id = ?`, [payload.user_id]);
                    resModel.data = ((_a = q2.rows) === null || _a === void 0 ? void 0 : _a[0]) || {};
                }
                else {
                    resModel.data = q.rows[0];
                }
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    updateProfile(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id) VALUES (?)`, [payload.user_id]);
                yield this.dao.executeQuery(`UPDATE dealer_profiles SET business_name=?, gst_no=?, payout_method=?, payout_details=? WHERE dealer_id=?`, [payload.business_name || null, payload.gst_no || null, payload.payout_method || null,
                    payload.payout_details ? JSON.stringify(payload.payout_details) : null, payload.user_id]);
                resModel.status = 1;
                resModel.info = 'Profile updated.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Payout = wallet withdrawal (balance-checked, debited immediately, admin-processed). */
    requestPayout(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.wallet.withdraw(payload);
        });
    }
    payouts(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT * FROM dealer_payouts WHERE dealer_id = ? ORDER BY requested_at DESC`, [payload.user_id]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Dealer = Dealer;
//# sourceMappingURL=dealer.js.map