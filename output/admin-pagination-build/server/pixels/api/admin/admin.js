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
exports.Admin = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const numbers_1 = require("../numbers/numbers");
const categories_1 = require("../categories/categories");
const testimonials_1 = require("../testimonials/testimonials");
const banners_1 = require("../banners/banners");
const orders_1 = require("../orders/orders");
const notifications_1 = require("../notifications/notifications");
const rbac_1 = require("../rbac/rbac");
const password_1 = require("../../../pixels-utility/password");
const wallet_1 = require("../wallet/wallet");
const categoryClassifier_1 = require("../categories/categoryClassifier");
class Admin {
    constructor() {
        this.numbers = new numbers_1.Numbers();
        this.categories = new categories_1.Categories();
        this.testimonials = new testimonials_1.Testimonials();
        this.banners = new banners_1.Banners();
        this.orders = new orders_1.Orders();
        this.rbac = new rbac_1.Rbac();
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    // ---------- Dashboard ----------
    dashboard(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const kpi = yield this.dao.executeQuery(`SELECT
                  (SELECT COUNT(*) FROM auth_user) AS users,
                  (SELECT COUNT(*) FROM auth_user WHERE role='DEALER') AS dealers,
                  (SELECT COUNT(*) FROM vip_numbers) AS numbers,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='AVAILABLE') AS available,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='SOLD') AS sold,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='PENDING_APPROVAL') AS pending_approval,
                  (SELECT COUNT(*) FROM orders) AS orders,
                  (SELECT COUNT(*) FROM orders WHERE payment_status='PAID') AS paid_orders,
                  (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='PAID') AS revenue`, []);
                const recentOrders = yield this.dao.executeQuery(`SELECT o.order_id, o.order_no, o.total, o.status, o.payment_status, o.created_at, u.full_name
                 FROM orders o LEFT JOIN auth_user u ON u.user_id = o.user_id ORDER BY o.created_at DESC LIMIT 8`, []);
                const topNumbers = yield this.dao.executeQuery(`SELECT number_id, number_value, display_number, views, offer_price, status, rtp_status, rtp_available_at FROM vip_numbers ORDER BY views DESC LIMIT 6`, []);
                // last 6 months revenue trend
                const trend = yield this.dao.executeQuery(`SELECT DATE_FORMAT(created_at,'%Y-%m') AS month, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
                 FROM orders WHERE payment_status='PAID' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY month ORDER BY month ASC`, []);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    kpi: ((_a = kpi.rows) === null || _a === void 0 ? void 0 : _a[0]) || {},
                    recent_orders: recentOrders.rows || [],
                    top_numbers: (topNumbers.rows || []).map((row) => (0, categoryClassifier_1.decorateNumberCategories)(row)),
                    trend: trend.rows || [],
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
    // ---------- Numbers ----------
    numbersList(payload) {
        return __awaiter(this, void 0, void 0, function* () { return this.numbers.list(Object.assign(Object.assign({}, payload), { status: payload.status || 'ALL', admin_scope: true })); });
    }
    numberSave(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return payload.number_id ? this.numbers.update(payload) : this.numbers.create(Object.assign(Object.assign({}, payload), { seller_id: payload.user_id, seller_type: 'ADMIN', status: payload.status || 'AVAILABLE' }));
        });
    }
    numberDelete(payload) {
        return __awaiter(this, void 0, void 0, function* () { return this.numbers.remove({ number_id: payload.number_id }); });
    }
    numberApprove(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const r = yield this.numbers.update({ number_id: payload.number_id, status: 'AVAILABLE' });
            const n = yield this.dao.executeQuery(`SELECT seller_id, display_number FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
            if ((_a = n.rows) === null || _a === void 0 ? void 0 : _a[0])
                yield (0, notifications_1.pushNotification)({ user_id: n.rows[0].seller_id, type: 'listing', title: 'Listing approved ✅', message: `Your number ${n.rows[0].display_number} is now live on the marketplace.` });
            return r;
        });
    }
    numberReject(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const r = yield this.numbers.update({ number_id: payload.number_id, status: 'REJECTED' });
            const n = yield this.dao.executeQuery(`SELECT seller_id, display_number FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
            if ((_a = n.rows) === null || _a === void 0 ? void 0 : _a[0])
                yield (0, notifications_1.pushNotification)({ user_id: n.rows[0].seller_id, type: 'listing', title: 'Listing rejected', message: `Your number ${n.rows[0].display_number} was not approved. Please review and edit it.` });
            return r;
        });
    }
    // ---------- Orders ----------
    ordersList(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = [];
                const params = [];
                if (payload.status) {
                    where.push('o.status = ?');
                    params.push(String(payload.status).toUpperCase());
                }
                if (payload.q) {
                    where.push('o.order_no LIKE ?');
                    params.push('%' + payload.q + '%');
                }
                const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
                const page = Math.max(1, Math.floor(Number(payload.page) || 1));
                const limit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit) || 20)));
                const count = yield this.dao.executeQuery(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
                const total = Number(((_b = (_a = count.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.total) || 0);
                const q = yield this.dao.executeQuery(`SELECT o.*, u.full_name FROM orders o LEFT JOIN auth_user u ON u.user_id = o.user_id ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { items: q.rows || [], total, page, limit, pages: Math.ceil(total / limit) };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    orderDetail(payload) {
        return __awaiter(this, void 0, void 0, function* () { return this.orders.detail({ user_id: 0, order_id: payload.order_id, is_admin: true }); });
    }
    orderUpdateStatus(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const status = String(payload.status).toUpperCase();
                yield this.dao.executeQuery(`UPDATE orders SET status = ? WHERE order_id = ?`, [status, Number(payload.order_id)]);
                if (status === 'COMPLETED')
                    yield this.dao.executeQuery(`UPDATE order_items SET item_status='TRANSFERRED' WHERE order_id = ?`, [Number(payload.order_id)]);
                const o = yield this.dao.executeQuery(`SELECT user_id, order_no FROM orders WHERE order_id = ?`, [Number(payload.order_id)]);
                if ((_a = o.rows) === null || _a === void 0 ? void 0 : _a[0])
                    yield (0, notifications_1.pushNotification)({ user_id: o.rows[0].user_id, type: 'order', title: 'Order update', message: `Your order ${o.rows[0].order_no} is now ${status}.` });
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
    // ---------- Users ----------
    usersList(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = [];
                const params = [];
                if (payload.role) {
                    where.push('role = ?');
                    params.push(String(payload.role).toUpperCase());
                }
                if (payload.q) {
                    where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
                    params.push('%' + payload.q + '%', '%' + payload.q + '%', '%' + payload.q + '%');
                }
                const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
                const page = Math.max(1, Math.floor(Number(payload.page) || 1));
                const limit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit) || 20)));
                const count = yield this.dao.executeQuery(`SELECT COUNT(*) AS total FROM auth_user ${whereSql}`, params);
                const total = Number(((_b = (_a = count.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.total) || 0);
                const q = yield this.dao.executeQuery(`SELECT user_id, full_name, email, phone, role, status, referral_code, created_at FROM auth_user ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { items: q.rows || [], total, page, limit, pages: Math.ceil(total / limit) };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    userSetRole(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const role = String(payload.role).toUpperCase();
                if (!['ADMIN', 'USER', 'DEALER', 'EMPLOYEE', 'SYSTEM'].includes(role))
                    throw new Error('Invalid role.');
                yield this.dao.executeQuery(`UPDATE auth_user SET role = ? WHERE user_id = ?`, [role, Number(payload.target_id)]);
                if (role === 'DEALER')
                    yield this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id, kyc_status) VALUES (?, 'PENDING')`, [Number(payload.target_id)]);
                resModel.status = 1;
                resModel.info = 'Role updated.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    userSetStatus(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const status = String(payload.status).toUpperCase();
                if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(status))
                    throw new Error('Invalid status.');
                yield this.dao.executeQuery(`UPDATE auth_user SET status = ? WHERE user_id = ?`, [status, Number(payload.target_id)]);
                resModel.status = 1;
                resModel.info = 'Status updated.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    // ---------- Dealers ----------
    dealersList(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT d.*, u.full_name, u.email, u.phone,
                        (SELECT COUNT(*) FROM vip_numbers n WHERE n.seller_id = d.dealer_id) AS listings
                 FROM dealer_profiles d LEFT JOIN auth_user u ON u.user_id = d.dealer_id ORDER BY d.created_at DESC`, []);
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
    dealerKyc(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const status = String(payload.kyc_status).toUpperCase();
                const fields = ['kyc_status = ?'];
                const params = [status];
                if (payload.commission_pct !== undefined) {
                    fields.push('commission_pct = ?');
                    params.push(Number(payload.commission_pct));
                }
                params.push(Number(payload.dealer_id));
                yield this.dao.executeQuery(`UPDATE dealer_profiles SET ${fields.join(', ')} WHERE dealer_id = ?`, params);
                yield (0, notifications_1.pushNotification)({ user_id: Number(payload.dealer_id), type: 'kyc', title: 'KYC ' + status, message: `Your dealer KYC status is now ${status}.` });
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
    /**
     * Admin creates a DEALER account and maps its permissions in one step.
     * `permissions` is the list of perm_keys the dealer should hold.
     */
    createDealer(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const email = String(payload.email || '').trim();
                const phone = String(payload.phone || '').trim();
                const full_name = String(payload.full_name || '').trim();
                const password = String(payload.password || '');
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    throw new Error('Please provide a valid email.');
                if (!phone)
                    throw new Error('Phone is required.');
                if (!full_name)
                    throw new Error('Full name is required.');
                if (password.length < 6)
                    throw new Error('Password must be at least 6 characters.');
                const referralCode = ('VNWD' + Math.random().toString(16).slice(2, 8)).toUpperCase().slice(0, 12);
                const ins = yield this.dao.executeQuery(`INSERT INTO auth_user (email, phone, password, full_name, role, logo, referral_code, status)
                 VALUES (?,?,?,?, 'DEALER', '', ?, 'ACTIVE')`, [email, phone, (0, password_1.hashPassword)(password), full_name, referralCode]);
                if (ins.status !== 1 || ins.insertId === 0) {
                    let msg = 'Unable to create dealer.';
                    if (ins.info && /duplicate/i.test(ins.info)) {
                        msg = /email/i.test(ins.info) ? 'Email already exists.' : /phone/i.test(ins.info) ? 'Phone already exists.' : 'Account already exists.';
                    }
                    throw new Error(msg);
                }
                const dealerId = ins.insertId;
                yield this.dao.executeQuery(`INSERT IGNORE INTO carts (user_id) VALUES (?)`, [dealerId]);
                yield this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id, business_name, commission_pct, kyc_status) VALUES (?,?,?, 'VERIFIED')`, [dealerId, payload.business_name || full_name, Number(payload.commission_pct) || 10.00]);
                // Map the selected permissions for this dealer.
                const perms = Array.isArray(payload.permissions) ? payload.permissions : [];
                yield this.rbac.setUserPermissions({ target_id: dealerId, permissions: perms, granted_by: Number(payload.user_id) });
                yield (0, notifications_1.pushNotification)({
                    user_id: dealerId, type: 'welcome',
                    title: 'Your dealer account is ready 🎉',
                    message: 'An administrator created your dealer account. Log in to manage your listings and sales.',
                });
                resModel.status = 1;
                resModel.info = 'Dealer created.';
                resModel.data = { user_id: dealerId, referral_code: referralCode };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Admin creates an EMPLOYEE (staff) account. Employee actions are admin-approved. */
    createEmployee(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const email = String(payload.email || '').trim();
                const phone = String(payload.phone || '').trim();
                const full_name = String(payload.full_name || '').trim();
                const password = String(payload.password || '');
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    throw new Error('Please provide a valid email.');
                if (!phone)
                    throw new Error('Phone is required.');
                if (!full_name)
                    throw new Error('Full name is required.');
                if (password.length < 6)
                    throw new Error('Password must be at least 6 characters.');
                const referralCode = ('VNWE' + Math.random().toString(16).slice(2, 8)).toUpperCase().slice(0, 12);
                const ins = yield this.dao.executeQuery(`INSERT INTO auth_user (email, phone, password, full_name, role, logo, referral_code, status)
                 VALUES (?,?,?,?, 'EMPLOYEE', '', ?, 'ACTIVE')`, [email, phone, (0, password_1.hashPassword)(password), full_name, referralCode]);
                if (ins.status !== 1 || ins.insertId === 0) {
                    let msg = 'Unable to create employee.';
                    if (ins.info && /duplicate/i.test(ins.info)) {
                        msg = /email/i.test(ins.info) ? 'Email already exists.' : /phone/i.test(ins.info) ? 'Phone already exists.' : 'Account already exists.';
                    }
                    throw new Error(msg);
                }
                yield this.dao.executeQuery(`INSERT IGNORE INTO carts (user_id) VALUES (?)`, [ins.insertId]);
                resModel.status = 1;
                resModel.info = 'Employee created.';
                resModel.data = { user_id: ins.insertId };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    // ---------- Payouts ----------
    payoutsList(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT p.*, u.full_name, u.email FROM dealer_payouts p LEFT JOIN auth_user u ON u.user_id = p.dealer_id ORDER BY p.requested_at DESC`, []);
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
    payoutUpdate(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const status = String(payload.status).toUpperCase();
                const pid = Number(payload.payout_id);
                // Load current state so we only reverse a not-yet-reversed rejection once.
                const cur = yield this.dao.executeQuery(`SELECT dealer_id, amount, status FROM dealer_payouts WHERE payout_id = ?`, [pid]);
                const row = (_a = cur.rows) === null || _a === void 0 ? void 0 : _a[0];
                if (!row)
                    throw new Error('Payout not found.');
                yield this.dao.executeQuery(`UPDATE dealer_payouts SET status = ?, reference = ?, processed_at = NOW() WHERE payout_id = ?`, [status, payload.reference || null, pid]);
                // Rejecting a payout returns the reserved funds to the wallet.
                if (status === 'REJECTED' && row.status !== 'REJECTED') {
                    yield (0, wallet_1.reverseWithdrawal)(pid, row.dealer_id, Number(row.amount));
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
    // ---------- Reviews ----------
    reviewsList(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = payload.status ? 'WHERE r.status = ?' : '';
                const params = payload.status ? [String(payload.status).toUpperCase()] : [];
                const q = yield this.dao.executeQuery(`SELECT r.*, u.full_name, n.display_number FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 LEFT JOIN vip_numbers n ON n.number_id = r.number_id ${where} ORDER BY r.created_at DESC LIMIT 200`, params);
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
    reviewModerate(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const status = String(payload.status).toUpperCase();
                if (status === 'DELETE')
                    yield this.dao.executeQuery(`DELETE FROM reviews WHERE review_id = ?`, [Number(payload.review_id)]);
                else
                    yield this.dao.executeQuery(`UPDATE reviews SET status = ? WHERE review_id = ?`, [status, Number(payload.review_id)]);
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
    // ---------- Contact messages ----------
    messagesList(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200`, []);
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
    // ---------- Coupons ----------
    couponsList(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT * FROM coupons ORDER BY coupon_id DESC`, []);
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
    couponSave(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const code = String(payload.code || '').trim().toUpperCase();
                if (!code)
                    throw new Error('Coupon code is required.');
                const type = String(payload.type || 'PERCENT').toUpperCase() === 'FLAT' ? 'FLAT' : 'PERCENT';
                const params = [code, type, Number(payload.value) || 0, Number(payload.min_order) || 0,
                    payload.max_discount ? Number(payload.max_discount) : null, payload.usage_limit ? Number(payload.usage_limit) : null,
                    payload.expires_at || null, payload.is_active === false ? 0 : 1];
                if (payload.coupon_id) {
                    yield this.dao.executeQuery(`UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_discount=?, usage_limit=?, expires_at=?, is_active=? WHERE coupon_id=?`, [...params, Number(payload.coupon_id)]);
                    resModel.data = { coupon_id: Number(payload.coupon_id) };
                }
                else {
                    const q = yield this.dao.executeQuery(`INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at, is_active) VALUES (?,?,?,?,?,?,?,?)`, params);
                    if (q.insertId === 0)
                        throw new Error(q.info && /duplicate/i.test(q.info) ? 'This coupon code already exists.' : 'Unable to save coupon.');
                    resModel.data = { coupon_id: q.insertId };
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
    couponDelete(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.dao.executeQuery(`DELETE FROM coupons WHERE coupon_id = ?`, [Number(payload.coupon_id)]);
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
    // ---------- Newsletter subscribers ----------
    newsletterList(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT * FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 1000`, []);
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
    // ---------- Settings (env key/value) ----------
    settingsGet(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const keys = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'SUPPORT_ADDRESS', 'PROMO_TEXT', 'PROMO_COUPON', 'GLOBAL_NUMBER_DISCOUNT_PERCENT',
                    'LEGAL_BUSINESS_NAME', 'LEGAL_REGISTERED_ADDRESS', 'LEGAL_JURISDICTION', 'LEGAL_EMAIL', 'GRIEVANCE_OFFICER_NAME', 'GRIEVANCE_EMAIL', 'GRIEVANCE_PHONE', 'GSTIN', 'CIN', 'POLICY_EFFECTIVE_DATE'];
                const q = yield this.dao.executeQuery(`SELECT key_id, value FROM env WHERE key_id IN (${keys.map(() => '?').join(',')})`, keys);
                const map = {};
                (q.rows || []).forEach((r) => map[r.key_id] = r.value);
                if (map.GLOBAL_NUMBER_DISCOUNT_PERCENT === undefined)
                    map.GLOBAL_NUMBER_DISCOUNT_PERCENT = '0';
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = map;
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    settingsSave(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            let connection;
            try {
                const allowed = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'SUPPORT_ADDRESS', 'PROMO_TEXT', 'PROMO_COUPON', 'GLOBAL_NUMBER_DISCOUNT_PERCENT',
                    'LEGAL_BUSINESS_NAME', 'LEGAL_REGISTERED_ADDRESS', 'LEGAL_JURISDICTION', 'LEGAL_EMAIL', 'GRIEVANCE_OFFICER_NAME', 'GRIEVANCE_EMAIL', 'GRIEVANCE_PHONE', 'GSTIN', 'CIN', 'POLICY_EFFECTIVE_DATE'];
                const globalDiscount = Number(payload.GLOBAL_NUMBER_DISCOUNT_PERCENT);
                if (!Number.isInteger(globalDiscount) || globalDiscount < 0 || globalDiscount > 99) {
                    throw new Error('Store discount must be a whole percentage from 0 to 99.');
                }
                connection = yield this.dao.getConnection();
                yield connection.beginTransaction();
                for (const k of allowed) {
                    if (payload[k] !== undefined) {
                        yield connection.query(`INSERT INTO env (key_id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [k, String(payload[k])]);
                    }
                }
                yield connection.query(`UPDATE vip_numbers
                 SET offer_price=ROUND(mrp * (100 - ?) / 100, 2), discount_pct=?`, [globalDiscount, globalDiscount]);
                yield connection.commit();
                resModel.status = 1;
                resModel.info = 'Settings saved.';
            }
            catch (error) {
                try {
                    yield (connection === null || connection === void 0 ? void 0 : connection.rollback());
                }
                catch (_a) { }
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            finally {
                connection === null || connection === void 0 ? void 0 : connection.release();
            }
            return resModel;
        });
    }
}
exports.Admin = Admin;
//# sourceMappingURL=admin.js.map