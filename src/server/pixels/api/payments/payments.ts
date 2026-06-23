import * as crypto from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { Orders } from '../orders/orders';

// Razorpay is required lazily so the server still boots without the package/keys.
let RazorpayLib: any = null;
try { RazorpayLib = require('razorpay'); } catch { /* optional until installed */ }

const KEY_ID = () => (process.env.RAZORPAY_KEY_ID || '').trim();
const KEY_SECRET = () => (process.env.RAZORPAY_KEY_SECRET || '').trim();
const WEBHOOK_SECRET = () => (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

export class Payments {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    private orders: Orders;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
        this.orders = new Orders();
    }

    private gatewayReady(): boolean {
        return !!(RazorpayLib && KEY_ID() && KEY_SECRET());
    }

    /** Creates a Razorpay order for an existing PENDING order and returns checkout params. */
    async createRazorpayOrder(payload: { user_id: number, order_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const oQ: any = await this.dao.executeQuery(
                `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`, [Number(payload.order_id), payload.user_id]
            );
            const order = oQ.rows?.[0];
            if (!order) throw new Error('Order not found.');
            if (order.payment_status === 'PAID') throw new Error('Order is already paid.');

            const amountPaise = Math.round(Number(order.total) * 100);

            if (!this.gatewayReady()) {
                throw new Error('Payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server .env.');
            }

            const rzp = new RazorpayLib({ key_id: KEY_ID(), key_secret: KEY_SECRET() });
            const rzpOrder = await rzp.orders.create({
                amount: amountPaise,
                currency: 'INR',
                receipt: order.order_no,
                notes: { order_id: String(order.order_id), order_no: order.order_no },
            });

            await this.dao.executeQuery(`UPDATE orders SET razorpay_order_id = ? WHERE order_id = ?`, [rzpOrder.id, order.order_id]);
            await this.dao.executeQuery(
                `INSERT INTO payments (order_id, razorpay_order_id, amount, currency, status) VALUES (?,?,?,?, 'CREATED')`,
                [order.order_id, rzpOrder.id, order.total, 'INR']
            );

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
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Verifies the client-side checkout signature and finalizes the order. */
    async verify(payload: { user_id: number, order_id: number, razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
            if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                throw new Error('Incomplete payment confirmation.');
            }
            const expected = crypto.createHmac('sha256', KEY_SECRET())
                .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
            if (expected !== razorpay_signature) {
                await this.dao.executeQuery(`UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?`, [Number(order_id)]);
                throw new Error('Payment signature verification failed.');
            }

            // Ensure the order belongs to this user.
            const oQ: any = await this.dao.executeQuery(`SELECT user_id FROM orders WHERE order_id = ?`, [Number(order_id)]);
            if (oQ.fetchedRows === 0 || oQ.rows[0].user_id !== payload.user_id) throw new Error('Order not found.');

            await this.dao.executeQuery(
                `UPDATE payments SET razorpay_payment_id = ?, status = 'CAPTURED' WHERE razorpay_order_id = ?`,
                [razorpay_payment_id, razorpay_order_id]
            );
            const order = await this.orders.finalizePaid(Number(order_id), { razorpay_order_id, razorpay_payment_id, razorpay_signature });

            resModel.status = 1;
            resModel.info = 'Payment verified.';
            resModel.data = { order_id: Number(order_id), order_no: order.order_no };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Razorpay server-to-server webhook (payment.captured). Verified via webhook secret. */
    async webhook(rawBody: string, signature: string, body: any) {
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
            const event = body?.event;
            const entity = body?.payload?.payment?.entity || body?.payload?.order?.entity;
            const rzpOrderId = entity?.order_id || entity?.id;
            if ((event === 'payment.captured' || event === 'order.paid') && rzpOrderId) {
                const oQ: any = await this.dao.executeQuery(`SELECT order_id FROM orders WHERE razorpay_order_id = ?`, [rzpOrderId]);
                const orderId = oQ.rows?.[0]?.order_id;
                if (orderId) {
                    await this.dao.executeQuery(
                        `UPDATE payments SET razorpay_payment_id = ?, status = 'CAPTURED', raw_payload = ? WHERE razorpay_order_id = ?`,
                        [entity?.id || null, JSON.stringify(body).slice(0, 60000), rzpOrderId]
                    );
                    await this.orders.finalizePaid(orderId, { razorpay_order_id: rzpOrderId, razorpay_payment_id: entity?.id });
                }
            }
            resModel.status = 1;
            resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        }
        return resModel;
    }
}
