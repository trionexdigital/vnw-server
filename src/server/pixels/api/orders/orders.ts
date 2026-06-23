import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';

export class Orders {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    private genOrderNo(): string {
        return 'VNW' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
    }

    /**
     * Creates a PENDING order from the user's cart (or a single buy-now number_id),
     * reserves the numbers, and computes totals (optional coupon). The Razorpay
     * order is created separately by the payments module using the returned order_id.
     */
    async create(payload: { user_id: number, number_id?: number, coupon_code?: string, customer?: any }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const userId = payload.user_id;

            // Resolve the set of numbers being purchased.
            let numberIds: number[] = [];
            if (payload.number_id) {
                numberIds = [Number(payload.number_id)];
            } else {
                const cartQ: any = await this.dao.executeQuery(
                    `SELECT ci.number_id FROM cart_items ci JOIN carts c ON c.cart_id = ci.cart_id WHERE c.user_id = ?`, [userId]
                );
                numberIds = (cartQ.rows || []).map((r: any) => r.number_id);
            }
            if (numberIds.length === 0) throw new Error('No items to order.');

            // Load & validate the numbers (must be AVAILABLE).
            const placeholders = numberIds.map(() => '?').join(',');
            const numsQ: any = await this.dao.executeQuery(
                `SELECT number_id, display_number, offer_price, seller_id, seller_type, status FROM vip_numbers WHERE number_id IN (${placeholders})`,
                numberIds
            );
            const nums = numsQ.rows || [];
            if (nums.length === 0) throw new Error('Selected numbers not found.');
            for (const n of nums) {
                if (n.status !== 'AVAILABLE') throw new Error(`Number ${n.display_number} is no longer available.`);
            }

            const subtotal = nums.reduce((s: number, n: any) => s + Number(n.offer_price), 0);

            // Optional coupon.
            let discount = 0; let appliedCoupon: string | null = null;
            if (payload.coupon_code) {
                const cQ: any = await this.dao.executeQuery(
                    `SELECT * FROM coupons WHERE code = ? AND is_active = 1`, [String(payload.coupon_code).toUpperCase()]
                );
                const c = cQ.rows?.[0];
                if (c && subtotal >= Number(c.min_order) && (!c.expires_at || new Date(c.expires_at) >= new Date())) {
                    discount = c.type === 'PERCENT' ? (subtotal * Number(c.value)) / 100 : Number(c.value);
                    if (c.max_discount) discount = Math.min(discount, Number(c.max_discount));
                    discount = Math.min(discount, subtotal);
                    appliedCoupon = c.code;
                }
            }
            const total = Math.max(0, subtotal - discount);

            // Customer snapshot.
            const uQ: any = await this.dao.executeQuery(`SELECT full_name, email, phone FROM auth_user WHERE user_id = ?`, [userId]);
            const u = uQ.rows?.[0] || {};
            const cust = payload.customer || {};

            const orderNo = this.genOrderNo();
            const ordIns: any = await this.dao.executeQuery(
                `INSERT INTO orders (order_no, user_id, subtotal, discount, total, status, payment_status, coupon_code, customer_name, customer_email, customer_phone)
                 VALUES (?,?,?,?,?, 'PENDING','UNPAID', ?,?,?,?)`,
                [orderNo, userId, subtotal, discount, total, appliedCoupon, cust.name || u.full_name, cust.email || u.email, cust.phone || u.phone]
            );
            if (ordIns.insertId === 0) throw new Error('Unable to create order.');
            const orderId = ordIns.insertId;

            // Order items (+ dealer commission snapshot) and reserve numbers.
            for (const n of nums) {
                let commission = 0;
                if (n.seller_type === 'DEALER') {
                    const dQ: any = await this.dao.executeQuery(`SELECT commission_pct FROM dealer_profiles WHERE dealer_id = ?`, [n.seller_id]);
                    const pct = Number(dQ.rows?.[0]?.commission_pct ?? 10);
                    commission = (Number(n.offer_price) * pct) / 100;
                }
                await this.dao.executeQuery(
                    `INSERT INTO order_items (order_id, number_id, seller_id, display_number, price, commission_amount, item_status)
                     VALUES (?,?,?,?,?,?, 'PENDING')`,
                    [orderId, n.number_id, n.seller_id, n.display_number, n.offer_price, commission]
                );
                await this.dao.executeQuery(`UPDATE vip_numbers SET status = 'RESERVED' WHERE number_id = ?`, [n.number_id]);
            }

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { order_id: orderId, order_no: orderNo, subtotal, discount, total };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Finalizes a paid order: marks order/items PAID, numbers SOLD, clears cart, pays referral, notifies. */
    async finalizePaid(orderId: number, pay: { razorpay_order_id?: string, razorpay_payment_id?: string, razorpay_signature?: string }) {
        const ordQ: any = await this.dao.executeQuery(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
        const order = ordQ.rows?.[0];
        if (!order) throw new Error('Order not found.');
        if (order.payment_status === 'PAID') return order; // idempotent

        await this.dao.executeQuery(
            `UPDATE orders SET status = 'PAID', payment_status = 'PAID', razorpay_order_id = ?, razorpay_payment_id = ?, razorpay_signature = ? WHERE order_id = ?`,
            [pay.razorpay_order_id || order.razorpay_order_id, pay.razorpay_payment_id || null, pay.razorpay_signature || null, orderId]
        );
        await this.dao.executeQuery(`UPDATE order_items SET item_status = 'PAID' WHERE order_id = ?`, [orderId]);

        // Mark each number SOLD.
        const itemsQ: any = await this.dao.executeQuery(`SELECT number_id FROM order_items WHERE order_id = ?`, [orderId]);
        for (const it of (itemsQ.rows || [])) {
            await this.dao.executeQuery(`UPDATE vip_numbers SET status = 'SOLD', stock = 0 WHERE number_id = ?`, [it.number_id]);
        }

        // Clear the buyer's cart of purchased numbers.
        await this.dao.executeQuery(
            `DELETE ci FROM cart_items ci JOIN carts c ON c.cart_id = ci.cart_id
             WHERE c.user_id = ? AND ci.number_id IN (SELECT number_id FROM order_items WHERE order_id = ?)`,
            [order.user_id, orderId]
        );

        // Referral reward: 2% of order total to the referrer (one-time per order).
        const refQ: any = await this.dao.executeQuery(`SELECT referred_by FROM auth_user WHERE user_id = ?`, [order.user_id]);
        const referrer = refQ.rows?.[0]?.referred_by;
        if (referrer) {
            const reward = Number((Number(order.total) * 0.02).toFixed(2));
            await this.dao.executeQuery(
                `INSERT INTO referral_earnings (user_id, source_user_id, type, amount, order_id) VALUES (?,?, 'PURCHASE', ?, ?)`,
                [referrer, order.user_id, reward, orderId]
            );
        }

        await pushNotification({
            user_id: order.user_id, type: 'order',
            title: 'Payment successful 🎉',
            message: `Your order ${order.order_no} is confirmed. Our team will begin the number transfer shortly.`,
        });

        return order;
    }

    async my(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
                 FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`, [payload.user_id]
            );
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = q.rows || [];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async detail(payload: { user_id: number, order_id: number, is_admin?: boolean }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const params: any[] = [Number(payload.order_id)];
            let scope = '';
            if (!payload.is_admin) { scope = ' AND user_id = ?'; params.push(payload.user_id); }
            const oQ: any = await this.dao.executeQuery(`SELECT * FROM orders WHERE order_id = ?${scope}`, params);
            if (oQ.fetchedRows === 0) throw new Error('Order not found.');
            const itemsQ: any = await this.dao.executeQuery(
                `SELECT oi.*, n.numerology_sum, n.operator, c.name AS category_name
                 FROM order_items oi LEFT JOIN vip_numbers n ON n.number_id = oi.number_id
                 LEFT JOIN categories c ON c.category_id = n.category_id WHERE oi.order_id = ?`, [Number(payload.order_id)]
            );
            const data = oQ.rows[0];
            data.items = itemsQ.rows || [];
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = data;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }
}
