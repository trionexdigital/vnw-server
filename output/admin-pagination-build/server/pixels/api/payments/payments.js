"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.Payments = void 0;
const crypto = __importStar(require("crypto"));
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const orders_1 = require("../orders/orders");
const prebooks_1 = require("../prebooks/prebooks");
// Razorpay is required lazily so the server still boots without the package/keys.
let RazorpayLib = null;
try {
    RazorpayLib = require('razorpay');
}
catch ( /* optional until installed */_a) { /* optional until installed */ }
const KEY_ID = () => (process.env.RAZORPAY_KEY_ID || '').trim();
const KEY_SECRET = () => (process.env.RAZORPAY_KEY_SECRET || '').trim();
const WEBHOOK_SECRET = () => (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
class Payments {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
        this.orders = new orders_1.Orders();
        this.prebooks = new prebooks_1.Prebooks();
    }
    gatewayReady() {
        return !!(RazorpayLib && KEY_ID() && KEY_SECRET());
    }
    /** Creates a Razorpay order for an existing PENDING order and returns checkout params. */
    createRazorpayOrder(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const oQ = yield this.dao.executeQuery(`SELECT * FROM orders WHERE order_id = ? AND user_id = ?`, [Number(payload.order_id), payload.user_id]);
                const order = (_a = oQ.rows) === null || _a === void 0 ? void 0 : _a[0];
                if (!order)
                    throw new Error('Order not found.');
                if (order.payment_status === 'PAID')
                    throw new Error('Order is already paid.');
                if (order.payment_expires_at && new Date(order.payment_expires_at + 'Z') <= new Date())
                    throw new Error('Payment hold has expired. Please start again.');
                const amountPaise = Math.round(Number(order.total) * 100);
                if (!this.gatewayReady()) {
                    throw new Error('Payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server .env.');
                }
                const rzp = new RazorpayLib({ key_id: KEY_ID(), key_secret: KEY_SECRET() });
                const rzpOrder = yield rzp.orders.create({
                    amount: amountPaise,
                    currency: 'INR',
                    receipt: order.order_no,
                    notes: { order_id: String(order.order_id), order_no: order.order_no },
                });
                yield this.dao.executeQuery(`UPDATE orders SET razorpay_order_id = ? WHERE order_id = ?`, [rzpOrder.id, order.order_id]);
                yield this.dao.executeQuery(`INSERT INTO payments (order_id, razorpay_order_id, amount, currency, status) VALUES (?,?,?,?, 'CREATED')`, [order.order_id, rzpOrder.id, order.total, 'INR']);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    key_id: KEY_ID(),
                    razorpay_order_id: rzpOrder.id,
                    amount: amountPaise,
                    currency: 'INR',
                    order_id: order.order_id,
                    order_no: order.order_no,
                    customer: { name: order.customer_name, email: order.customer_email, contact: order.customer_phone },
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
    /** Verifies the client-side checkout signature and finalizes the order. */
    verify(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
                if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    throw new Error('Incomplete payment confirmation.');
                }
                // Establish ownership before any failure path is allowed to mutate
                // or release the order's reserved inventory.
                const oQ = yield this.dao.executeQuery(`SELECT user_id,order_type,razorpay_order_id FROM orders WHERE order_id = ?`, [Number(order_id)]);
                if (oQ.fetchedRows === 0 || Number(oQ.rows[0].user_id) !== Number(payload.user_id))
                    throw new Error('Order not found.');
                if (oQ.rows[0].razorpay_order_id && oQ.rows[0].razorpay_order_id !== razorpay_order_id)
                    throw new Error('Payment order does not match this purchase.');
                const expected = crypto.createHmac('sha256', KEY_SECRET())
                    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
                if (expected !== razorpay_signature) {
                    if (((_b = (_a = oQ.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.order_type) === 'PURCHASE')
                        yield this.orders.failPurchase(Number(order_id));
                    else
                        yield this.dao.executeQuery(`UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?`, [Number(order_id)]);
                    throw new Error('Payment signature verification failed.');
                }
                yield this.dao.executeQuery(`UPDATE payments SET razorpay_payment_id = ?, status = 'CAPTURED' WHERE razorpay_order_id = ?`, [razorpay_payment_id, razorpay_order_id]);
                const order = oQ.rows[0].order_type === 'PREBOOK'
                    ? yield this.prebooks.finalizePaid(Number(order_id), { razorpay_order_id, razorpay_payment_id, razorpay_signature })
                    : yield this.orders.finalizePaid(Number(order_id), { razorpay_order_id, razorpay_payment_id, razorpay_signature });
                resModel.status = 1;
                resModel.info = 'Payment verified.';
                resModel.data = { order_id: Number(order_id), order_no: order.order_no };
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
    /** Razorpay server-to-server webhook (payment.captured). Verified via webhook secret. */
    webhook(rawBody, signature, body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            let resModel = this.masterModel.getResponseModel();
            try {
                const secret = WEBHOOK_SECRET();
                if (secret && rawBody && signature) {
                    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
                    if (expected !== signature) {
                        resModel.status = -1;
                        resModel.info = 'Invalid webhook signature.';
                        return resModel;
                    }
                }
                const event = body === null || body === void 0 ? void 0 : body.event;
                const entity = ((_b = (_a = body === null || body === void 0 ? void 0 : body.payload) === null || _a === void 0 ? void 0 : _a.payment) === null || _b === void 0 ? void 0 : _b.entity) || ((_d = (_c = body === null || body === void 0 ? void 0 : body.payload) === null || _c === void 0 ? void 0 : _c.order) === null || _d === void 0 ? void 0 : _d.entity);
                const refundEntity = (_f = (_e = body === null || body === void 0 ? void 0 : body.payload) === null || _e === void 0 ? void 0 : _e.refund) === null || _f === void 0 ? void 0 : _f.entity;
                if ((event === 'refund.processed' || event === 'refund.failed') && refundEntity) {
                    yield this.prebooks.handleRefundWebhook(event, refundEntity, body);
                    resModel.status = 1;
                    resModel.info = 'OK';
                    return resModel;
                }
                const rzpOrderId = (entity === null || entity === void 0 ? void 0 : entity.order_id) || (entity === null || entity === void 0 ? void 0 : entity.id);
                if ((event === 'payment.captured' || event === 'order.paid') && rzpOrderId) {
                    const oQ = yield this.dao.executeQuery(`SELECT order_id,order_type FROM orders WHERE razorpay_order_id = ?`, [rzpOrderId]);
                    const orderId = (_h = (_g = oQ.rows) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.order_id;
                    if (orderId) {
                        yield this.dao.executeQuery(`UPDATE payments SET razorpay_payment_id = ?, status = 'CAPTURED', raw_payload = ? WHERE razorpay_order_id = ?`, [(entity === null || entity === void 0 ? void 0 : entity.id) || null, JSON.stringify(body).slice(0, 60000), rzpOrderId]);
                        if (oQ.rows[0].order_type === 'PREBOOK') {
                            yield this.prebooks.finalizePaid(orderId, { razorpay_order_id: rzpOrderId, razorpay_payment_id: entity === null || entity === void 0 ? void 0 : entity.id });
                        }
                        else {
                            yield this.orders.finalizePaid(orderId, { razorpay_order_id: rzpOrderId, razorpay_payment_id: entity === null || entity === void 0 ? void 0 : entity.id });
                        }
                    }
                }
                if (event === 'payment.failed' && rzpOrderId) {
                    const oQ = yield this.dao.executeQuery(`SELECT order_id,order_type FROM orders WHERE razorpay_order_id = ?`, [rzpOrderId]);
                    const order = (_j = oQ.rows) === null || _j === void 0 ? void 0 : _j[0];
                    if ((order === null || order === void 0 ? void 0 : order.order_type) === 'PREBOOK')
                        yield this.prebooks.failPending(Number(order.order_id));
                    else if ((order === null || order === void 0 ? void 0 : order.order_type) === 'PURCHASE')
                        yield this.orders.failPurchase(Number(order.order_id));
                    yield this.dao.executeQuery(`UPDATE payments SET razorpay_payment_id=?,status='FAILED',raw_payload=? WHERE razorpay_order_id=?`, [(entity === null || entity === void 0 ? void 0 : entity.id) || null, JSON.stringify(body).slice(0, 60000), rzpOrderId]);
                }
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            return resModel;
        });
    }
}
exports.Payments = Payments;
//# sourceMappingURL=payments.js.map