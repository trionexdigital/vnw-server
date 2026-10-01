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
exports.Sell = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const numbers_1 = require("../numbers/numbers");
const notifications_1 = require("../notifications/notifications");
const wallet_1 = require("../wallet/wallet");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const SELL_REQUEST_COLUMNS = `s.request_id, s.user_id, s.number_value, s.display_number, s.operator,
    s.asking_price, s.description, s.contact_phone, s.status, s.admin_id, s.admin_note,
    s.offer_price, s.buy_price, s.number_id, s.created_at, s.processed_at`;
function decorateSellRequest(row) {
    try {
        return (0, categoryClassifier_1.decorateNumberCategories)(row);
    }
    catch (_a) {
        return (0, categoryClassifier_1.decorateNumberCategories)(row, ['unique-numbers']);
    }
}
/**
 * "Sell your number" workflow. A USER offers a number they own to the platform.
 * The request stays PENDING until an ADMIN approves it — only then is a live
 * catalog listing created (owned by the platform). Approval is admin-only.
 */
class Sell {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
        this.numbers = new numbers_1.Numbers();
    }
    // ---------- USER ----------
    /** A customer raises a request to sell their own number to us. */
    create(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const number_value = (0, categoryClassifier_1.normalizeIndianNumber)((_a = payload.number_value) !== null && _a !== void 0 ? _a : payload.display_number);
                const display_number = String(payload.display_number || number_value).trim();
                if ((0, categoryClassifier_1.normalizeIndianNumber)(display_number) !== number_value) {
                    throw new Error('Display number must match the submitted mobile number.');
                }
                const asking = Number(payload.asking_price) || 0;
                if (asking <= 0)
                    throw new Error('Please enter your expected price.');
                const q = yield this.dao.executeQuery(`INSERT INTO sell_requests (user_id, number_value, display_number, operator, asking_price, description, contact_phone, status)
                 VALUES (?,?,?,?,?,?,?, 'PENDING')`, [Number(payload.user_id), number_value, display_number, payload.operator || null,
                    asking, payload.description || null, payload.contact_phone || null]);
                if (q.status !== 1 || q.insertId === 0)
                    throw new Error('Unable to submit your request. Please try again.');
                yield (0, notifications_1.pushNotification)({
                    user_id: Number(payload.user_id), type: 'sell',
                    title: 'Sell request submitted',
                    message: `Your request to sell ${display_number} is pending admin review. We'll notify you once it's reviewed.`,
                });
                const deprecationWarning = payload.category_id !== undefined
                    ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                    : undefined;
                if (deprecationWarning)
                    this.logger.info(deprecationWarning);
                const automaticCategory = (0, categoryClassifier_1.decorateNumberCategories)({ number_value, display_number });
                resModel.status = 1;
                resModel.info = deprecationWarning || 'Sell request submitted for review.';
                resModel.data = Object.assign({ request_id: q.insertId, categories: automaticCategory.categories, primary_category: automaticCategory.primary_category, category_name: automaticCategory.category_name, category_slug: automaticCategory.category_slug, classifier_version: automaticCategory.classifier_version }, (deprecationWarning ? { deprecation_warning: deprecationWarning } : {}));
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            return resModel;
        });
    }
    /** Lists the caller's own sell requests. */
    mine(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT ${SELL_REQUEST_COLUMNS} FROM sell_requests s
                 WHERE s.user_id = ? ORDER BY s.created_at DESC`, [Number(payload.user_id)]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = (q.rows || []).map(decorateSellRequest);
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Cancels the caller's own pending request. */
    cancel(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`UPDATE sell_requests SET status='CANCELLED', processed_at=NOW()
                 WHERE request_id = ? AND user_id = ? AND status='PENDING'`, [Number(payload.request_id), Number(payload.user_id)]);
                if (q.affectedRows === 0)
                    throw new Error('Request not found or no longer cancellable.');
                resModel.status = 1;
                resModel.info = 'Request cancelled.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    // ---------- ADMIN ----------
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = [];
                const params = [];
                if (payload.status) {
                    where.push('s.status = ?');
                    params.push(String(payload.status).toUpperCase());
                }
                if (payload.q) {
                    where.push('(s.display_number LIKE ? OR s.number_value LIKE ?)');
                    params.push('%' + payload.q + '%', '%' + payload.q + '%');
                }
                const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
                const q = yield this.dao.executeQuery(`SELECT ${SELL_REQUEST_COLUMNS}, u.full_name, u.email, u.phone AS user_phone
                 FROM sell_requests s
                 LEFT JOIN auth_user u ON u.user_id = s.user_id
                 ${whereSql} ORDER BY s.created_at DESC LIMIT 300`, params);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = (q.rows || []).map(decorateSellRequest);
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /**
     * Admin approves a sell request → creates a live platform listing for the
     * number and links it back to the request. MRP defaults to the user's asking
     * price; the store-wide discount determines the catalog selling price.
     */
    approve(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            let resModel = this.masterModel.getResponseModel();
            try {
                const rid = Number(payload.request_id);
                const r = yield this.dao.executeQuery(`SELECT ${SELL_REQUEST_COLUMNS} FROM sell_requests s WHERE s.request_id = ?`, [rid]);
                if (r.fetchedRows === 0)
                    throw new Error('Sell request not found.');
                const reqRow = r.rows[0];
                if (reqRow.status !== 'PENDING')
                    throw new Error('This request has already been processed.');
                const mrp = Number(payload.mrp) || Number(reqRow.asking_price) || 0;
                // What the platform pays the seller (credited to their wallet). Defaults to asking price.
                const buyPrice = Number(payload.buy_price) || Number(reqRow.asking_price) || 0;
                // Create the catalog listing owned by the platform (admin seller_id = 1).
                const created = yield this.numbers.create({
                    number_value: reqRow.number_value,
                    display_number: reqRow.display_number,
                    seller_id: 1,
                    seller_type: 'ADMIN',
                    title_label: 'VIP Number',
                    mrp,
                    description: reqRow.description,
                    status: 'AVAILABLE',
                });
                if (created.status !== 1)
                    throw new Error(created.info || 'Unable to create listing from this request.');
                const newNumberId = ((_a = created.data) === null || _a === void 0 ? void 0 : _a.number_id) || null;
                const catalog = yield this.dao.executeQuery(`SELECT offer_price FROM vip_numbers WHERE number_id=?`, [newNumberId]);
                const discountedPrice = Number((_c = (_b = catalog.rows) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.offer_price) || 0;
                yield this.dao.executeQuery(`UPDATE sell_requests SET status='APPROVED', admin_id=?, admin_note=?, offer_price=?, buy_price=?, number_id=?, processed_at=NOW()
                 WHERE request_id = ?`, [Number(payload.user_id), payload.admin_note || null, discountedPrice, buyPrice, newNumberId, rid]);
                // Pay the seller into their wallet (platform buys the number). Idempotent per request.
                let credited = false;
                if (buyPrice > 0) {
                    credited = yield (0, wallet_1.creditWallet)(reqRow.user_id, buyPrice, 'SELL_PAYOUT', 'sell_request', rid, `Sold ${reqRow.display_number} to VIP Number World`);
                }
                yield (0, notifications_1.pushNotification)({
                    user_id: reqRow.user_id, type: 'sell',
                    title: 'Sell request approved ✅',
                    message: credited
                        ? `Your number ${reqRow.display_number} was approved. ₹${buyPrice} has been credited to your wallet.`
                        : `Your number ${reqRow.display_number} was approved and is now listed.`,
                });
                const deprecationWarning = payload.category_id !== undefined
                    ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                    : undefined;
                if (deprecationWarning)
                    this.logger.info(deprecationWarning);
                resModel.status = 1;
                resModel.info = deprecationWarning || 'Sell request approved.';
                resModel.data = Object.assign({ number_id: newNumberId, buy_price: buyPrice, categories: ((_d = created.data) === null || _d === void 0 ? void 0 : _d.categories) || [], primary_category: ((_e = created.data) === null || _e === void 0 ? void 0 : _e.primary_category) || null, category_name: ((_f = created.data) === null || _f === void 0 ? void 0 : _f.category_name) || null, category_slug: ((_g = created.data) === null || _g === void 0 ? void 0 : _g.category_slug) || null, classifier_version: ((_h = created.data) === null || _h === void 0 ? void 0 : _h.classifier_version) || null }, (deprecationWarning ? { deprecation_warning: deprecationWarning } : {}));
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    reject(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const rid = Number(payload.request_id);
                const q = yield this.dao.executeQuery(`UPDATE sell_requests SET status='REJECTED', admin_id=?, admin_note=?, processed_at=NOW()
                 WHERE request_id = ? AND status='PENDING'`, [Number(payload.user_id), payload.admin_note || null, rid]);
                if (q.affectedRows === 0)
                    throw new Error('Request not found or already processed.');
                const r = yield this.dao.executeQuery(`SELECT user_id, display_number FROM sell_requests WHERE request_id = ?`, [rid]);
                if ((_a = r.rows) === null || _a === void 0 ? void 0 : _a[0])
                    yield (0, notifications_1.pushNotification)({
                        user_id: r.rows[0].user_id, type: 'sell',
                        title: 'Sell request rejected',
                        message: `Your request to sell ${r.rows[0].display_number} was not approved.` + (payload.admin_note ? ` Note: ${payload.admin_note}` : ''),
                    });
                resModel.status = 1;
                resModel.info = 'Sell request rejected.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Sell = Sell;
//# sourceMappingURL=sell.js.map