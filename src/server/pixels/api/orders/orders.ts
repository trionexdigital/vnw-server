import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';
import { creditWallet } from '../wallet/wallet';
import { decorateNumberCategories } from '../categories/categoryClassifier';
import { Prebooks } from '../prebooks/prebooks';

export class Orders {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    private prebooks: Prebooks;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
        this.prebooks = new Prebooks();
    }

    private genOrderNo(): string {
        return 'VNW' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
    }

    /** Release abandoned regular checkout reservations. Safe to call opportunistically. */
    async reconcilePurchases() {
        const expired: any = await this.dao.executeQuery(
            "SELECT order_id FROM orders WHERE order_type='PURCHASE' AND payment_status='UNPAID' AND status='PENDING' AND payment_expires_at IS NOT NULL AND payment_expires_at<=UTC_TIMESTAMP() LIMIT 100", []);
        for (const row of (expired.rows || [])) {
            let connection: any;
            try {
                connection = await this.dao.getConnection(); await connection.beginTransaction();
                const [orders]: any = await connection.query("SELECT payment_status,status FROM orders WHERE order_id=? FOR UPDATE", [row.order_id]);
                if (orders?.[0]?.payment_status !== 'UNPAID' || orders?.[0]?.status !== 'PENDING') { await connection.commit(); continue; }
                const [numbers]: any = await connection.query('SELECT number_id FROM order_items WHERE order_id=?', [row.order_id]);
                for (const item of (numbers || [])) await connection.query("UPDATE vip_numbers SET status='AVAILABLE' WHERE number_id=? AND status='RESERVED'", [item.number_id]);
                const [accessories]: any = await connection.query('SELECT accessory_id,quantity FROM accessory_order_items WHERE order_id=?', [row.order_id]);
                for (const item of (accessories || [])) await connection.query('UPDATE accessory_products SET reserved_stock=GREATEST(0,reserved_stock-?) WHERE accessory_id=?', [item.quantity, item.accessory_id]);
                await connection.query("UPDATE orders SET status='CANCELLED',payment_status='FAILED' WHERE order_id=? AND payment_status='UNPAID'", [row.order_id]);
                await connection.commit();
            } catch { try { await connection?.rollback(); } catch {} }
            finally { connection?.release(); }
        }
    }

    async failPurchase(orderId: number) {
        let connection: any;
        try {
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const [orders]: any = await connection.query("SELECT payment_status,status,order_type FROM orders WHERE order_id=? FOR UPDATE", [orderId]);
            const order = orders?.[0];
            if (!order || order.order_type !== 'PURCHASE' || order.payment_status === 'PAID') { await connection.commit(); return; }
            const [numbers]: any = await connection.query('SELECT number_id FROM order_items WHERE order_id=?', [orderId]);
            for (const item of (numbers || [])) await connection.query("UPDATE vip_numbers SET status='AVAILABLE' WHERE number_id=? AND status='RESERVED'", [item.number_id]);
            const [accessories]: any = await connection.query('SELECT accessory_id,quantity FROM accessory_order_items WHERE order_id=?', [orderId]);
            for (const item of (accessories || [])) await connection.query('UPDATE accessory_products SET reserved_stock=GREATEST(0,reserved_stock-?) WHERE accessory_id=?', [item.quantity,item.accessory_id]);
            await connection.query("UPDATE orders SET status='CANCELLED',payment_status='FAILED' WHERE order_id=?", [orderId]);
            await connection.commit();
        } catch (error) { try { await connection?.rollback(); } catch {} throw error; }
        finally { connection?.release(); }
    }

    /**
     * Creates a PENDING order from the user's cart (or a single buy-now number_id),
     * reserves the numbers, and computes totals (optional coupon). The Razorpay
     * order is created separately by the payments module using the returned order_id.
     */
    async create(payload: { user_id: number, number_id?: number, accessory_id?: number, accessory_quantity?: number, coupon_code?: string, customer?: any, shipping?: any }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        let connection: any;
        try {
            await this.prebooks.reconcile();
            await this.reconcilePurchases();
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
            numberIds = Array.from(new Set(numberIds));

            let accessoryItems: Array<{ accessory_id: number, quantity: number }> = [];
            if (payload.accessory_id) accessoryItems = [{ accessory_id: Number(payload.accessory_id), quantity: Math.min(10, Math.max(1, Math.floor(Number(payload.accessory_quantity) || 1))) }];
            else if (!payload.number_id) {
                const accessoryCart: any = await this.dao.executeQuery(
                    `SELECT aci.accessory_id,aci.quantity FROM accessory_cart_items aci INNER JOIN carts c ON c.cart_id=aci.cart_id WHERE c.user_id=?`, [userId]);
                accessoryItems = (accessoryCart.rows || []).map((row: any) => ({ accessory_id: Number(row.accessory_id), quantity: Number(row.quantity) }));
            }
            if (numberIds.length === 0 && accessoryItems.length === 0) throw new Error('No items to order.');
            if (accessoryItems.length) {
                const shipping = payload.shipping || {};
                if (!String(shipping.name || '').trim() || !String(shipping.phone || '').trim() || !String(shipping.address_line1 || '').trim()
                    || !String(shipping.city || '').trim() || !String(shipping.state || '').trim() || !/^\d{6}$/.test(String(shipping.postal_code || '').trim())) {
                    throw new Error('A complete delivery address with a valid six-digit postal code is required.');
                }
            }
            connection = await this.dao.getConnection();
            await connection.beginTransaction();

            // Lock before validating so purchase and pre-book checkout cannot
            // reserve the same number concurrently.
            let nums: any[] = [];
            if (numberIds.length) {
                const placeholders = numberIds.map(() => '?').join(',');
                const result: any = await connection.query(
                    `SELECT number_id, display_number, offer_price, seller_id, seller_type, status, stock, rtp_status FROM vip_numbers WHERE number_id IN (${placeholders}) FOR UPDATE`, numberIds);
                nums = result[0] || [];
            }
            if ((nums || []).length !== numberIds.length) throw new Error('One or more selected numbers were not found.');
            for (const n of nums) {
                if (n.status !== 'AVAILABLE' || Number(n.stock) <= 0) throw new Error(`Number ${n.display_number} is no longer available.`);
                if (n.rtp_status !== 'RTP') throw new Error(`Number ${n.display_number} must be pre-booked until its RTP date.`);
            }

            let accessories: any[] = [];
            if (accessoryItems.length) {
                const accessoryIds = accessoryItems.map((item) => item.accessory_id);
                const [rows]: any = await connection.query(`SELECT accessory_id,name,brand,model,sku,offer_price,stock,reserved_stock,status FROM accessory_products WHERE accessory_id IN (${accessoryIds.map(() => '?').join(',')}) FOR UPDATE`, accessoryIds);
                if ((rows || []).length !== accessoryItems.length) throw new Error('One or more accessories were not found.');
                accessories = (rows || []).map((product: any) => ({ ...product, quantity: accessoryItems.find((item) => item.accessory_id === Number(product.accessory_id))?.quantity || 1 }));
                for (const product of accessories) {
                    if (product.status !== 'ACTIVE' || Number(product.stock) - Number(product.reserved_stock) < Number(product.quantity)) throw new Error(`${product.name} does not have enough stock.`);
                }
            }

            const subtotal = nums.reduce((s: number, n: any) => s + Number(n.offer_price), 0)
                + accessories.reduce((s: number, item: any) => s + Number(item.offer_price) * Number(item.quantity), 0);

            // Optional coupon.
            let discount = 0; let appliedCoupon: string | null = null;
            if (payload.coupon_code) {
                const [coupons]: any = await connection.query(
                    `SELECT * FROM coupons WHERE code = ? AND is_active = 1`, [String(payload.coupon_code).toUpperCase()]
                );
                const c = coupons?.[0];
                if (c && subtotal >= Number(c.min_order) && (!c.expires_at || new Date(c.expires_at) >= new Date())) {
                    discount = c.type === 'PERCENT' ? (subtotal * Number(c.value)) / 100 : Number(c.value);
                    if (c.max_discount) discount = Math.min(discount, Number(c.max_discount));
                    discount = Math.min(discount, subtotal);
                    appliedCoupon = c.code;
                }
            }
            const total = Math.max(0, subtotal - discount);

            // Customer snapshot.
            const [users]: any = await connection.query(`SELECT full_name, email, phone FROM auth_user WHERE user_id = ?`, [userId]);
            const u = users?.[0] || {};
            const cust = payload.customer || {};

            const orderNo = this.genOrderNo(); const shipping = payload.shipping || {};
            const [ordIns]: any = await connection.query(
                `INSERT INTO orders (order_no,user_id,subtotal,discount,total,status,payment_status,order_type,payment_expires_at,coupon_code,
                    customer_name,customer_email,customer_phone,shipping_name,shipping_phone,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_postal_code)
                 VALUES (?,?,?,?,?,'PENDING','UNPAID','PURCHASE',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),?,?,?,?,?,?,?,?,?,?,?)`,
                [orderNo,userId,subtotal,discount,total,appliedCoupon,cust.name||u.full_name,cust.email||u.email,cust.phone||u.phone,
                 shipping.name||null,shipping.phone||null,shipping.address_line1||null,shipping.address_line2||null,shipping.city||null,shipping.state||null,shipping.postal_code||null]
            );
            if (ordIns.insertId === 0) throw new Error('Unable to create order.');
            const orderId = ordIns.insertId;

            // Order items (+ dealer commission snapshot) and reserve numbers.
            for (const n of nums) {
                let commission = 0;
                if (n.seller_type === 'DEALER') {
                    const [dealers]: any = await connection.query(`SELECT commission_pct FROM dealer_profiles WHERE dealer_id = ?`, [n.seller_id]);
                    const pct = Number(dealers?.[0]?.commission_pct ?? 10);
                    commission = (Number(n.offer_price) * pct) / 100;
                }
                await connection.query(
                    `INSERT INTO order_items (order_id, number_id, seller_id, display_number, price, commission_amount, item_status)
                     VALUES (?,?,?,?,?,?, 'PENDING')`,
                    [orderId, n.number_id, n.seller_id, n.display_number, n.offer_price, commission]
                );
                const [reserved]: any = await connection.query(`UPDATE vip_numbers SET status = 'RESERVED' WHERE number_id = ? AND status='AVAILABLE' AND stock>0 AND rtp_status='RTP'`, [n.number_id]);
                if (reserved.affectedRows !== 1) throw new Error(`Number ${n.display_number} was just reserved by another customer.`);
            }
            for (const product of accessories) {
                const lineTotal = Number(product.offer_price) * Number(product.quantity);
                await connection.query(`INSERT INTO accessory_order_items (order_id,accessory_id,name,brand,model,sku,quantity,unit_price,line_total)
                    VALUES (?,?,?,?,?,?,?,?,?)`, [orderId,product.accessory_id,product.name,product.brand,product.model,product.sku,product.quantity,product.offer_price,lineTotal]);
                const [reserved]: any = await connection.query(`UPDATE accessory_products SET reserved_stock=reserved_stock+? WHERE accessory_id=? AND status='ACTIVE' AND (stock-reserved_stock)>=?`, [product.quantity,product.accessory_id,product.quantity]);
                if (reserved.affectedRows !== 1) throw new Error(`${product.name} was just reserved by another customer.`);
            }
            await connection.commit();

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { order_id: orderId, order_no: orderNo, subtotal, discount, total };
        } catch (error) {
            if (connection) { try { await connection.rollback(); } catch {} }
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            if (connection) connection.release();
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Finalizes a paid order: marks order/items PAID, numbers SOLD, clears cart, pays referral, notifies. */
    async finalizePaid(orderId: number, pay: { razorpay_order_id?: string, razorpay_payment_id?: string, razorpay_signature?: string }) {
        let connection: any; let order: any;
        try {
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const [orders]: any = await connection.query('SELECT * FROM orders WHERE order_id=? FOR UPDATE', [orderId]);
            order = orders?.[0];
            if (!order) throw new Error('Order not found.');
            if (order.payment_status === 'PAID') { await connection.commit(); return order; }
            const [accessoryItems]: any = await connection.query('SELECT accessory_id,quantity,name FROM accessory_order_items WHERE order_id=? FOR UPDATE', [orderId]);
            for (const item of (accessoryItems || [])) {
                const [updated]: any = await connection.query('UPDATE accessory_products SET stock=stock-?,reserved_stock=GREATEST(0,reserved_stock-?) WHERE accessory_id=? AND stock>=? AND reserved_stock>=?', [item.quantity,item.quantity,item.accessory_id,item.quantity,item.quantity]);
                if (updated.affectedRows !== 1) throw new Error(`${item.name} stock could not be finalized.`);
            }
            await connection.query(`UPDATE vip_numbers n INNER JOIN order_items oi ON oi.number_id=n.number_id SET n.status='SOLD',n.stock=0 WHERE oi.order_id=? AND n.status='RESERVED'`, [orderId]);
            await connection.query("UPDATE order_items SET item_status='PAID' WHERE order_id=?", [orderId]);
            await connection.query(`UPDATE orders SET status='PAID',payment_status='PAID',razorpay_order_id=?,razorpay_payment_id=?,razorpay_signature=? WHERE order_id=?`,
                [pay.razorpay_order_id || order.razorpay_order_id,pay.razorpay_payment_id || order.razorpay_payment_id,pay.razorpay_signature || order.razorpay_signature,orderId]);
            await connection.commit();
            order = { ...order, status: 'PAID', payment_status: 'PAID' };
        } catch (error) { try { await connection?.rollback(); } catch {} throw error; }
        finally { connection?.release(); }

        // Mark each number SOLD and credit dealer earnings to their wallet.
        const itemsQ: any = await this.dao.executeQuery(
            `SELECT oi.order_item_id, oi.number_id, oi.seller_id, oi.display_number, oi.price, oi.commission_amount, u.role AS seller_role
             FROM order_items oi LEFT JOIN auth_user u ON u.user_id = oi.seller_id WHERE oi.order_id = ?`, [orderId]);
        for (const it of (itemsQ.rows || [])) {
            // A dealer who listed the number earns (sale price − commission). Idempotent per order_item.
            if ((it.seller_role || '').toUpperCase() === 'DEALER') {
                const net = Number((Number(it.price) - Number(it.commission_amount || 0)).toFixed(2));
                if (net > 0) {
                    const credited = await creditWallet(
                        it.seller_id, net, 'SALE', 'order_item', it.order_item_id,
                        `Sale of ${it.display_number} (order ${order.order_no})`);
                    if (credited) await pushNotification({
                        user_id: it.seller_id, type: 'wallet',
                        title: 'Number sold 🎉',
                        message: `${it.display_number} sold. ₹${net} credited to your wallet.`,
                    });
                }
            }
        }

        // Clear the buyer's cart of purchased numbers.
        await this.dao.executeQuery(
            `DELETE ci FROM cart_items ci JOIN carts c ON c.cart_id = ci.cart_id
             WHERE c.user_id = ? AND ci.number_id IN (SELECT number_id FROM order_items WHERE order_id = ?)`,
            [order.user_id, orderId]
        );
        await this.dao.executeQuery(
            `DELETE aci FROM accessory_cart_items aci JOIN carts c ON c.cart_id=aci.cart_id
             WHERE c.user_id=? AND aci.accessory_id IN (SELECT accessory_id FROM accessory_order_items WHERE order_id=?)`, [order.user_id,orderId]);

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
                `SELECT o.*, ((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.order_id)+(SELECT COUNT(*) FROM accessory_order_items aoi WHERE aoi.order_id=o.order_id)) AS item_count
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
                `SELECT oi.*, COALESCE(n.number_value, oi.display_number) AS number_value,
                        n.numerology_sum, n.operator, n.status, n.rtp_status, n.rtp_available_at
                 FROM order_items oi LEFT JOIN vip_numbers n ON n.number_id = oi.number_id
                 WHERE oi.order_id = ?`, [Number(payload.order_id)]
            );
            const data = oQ.rows[0];
            data.items = (itemsQ.rows || []).map((row: any) => {
                try { return { ...decorateNumberCategories(row), item_type: 'NUMBER', item_id: Number(row.number_id), quantity: 1, unit_price: Number(row.price), line_total: Number(row.price) }; }
                catch { return { ...decorateNumberCategories(row, ['unique-numbers']), item_type: 'NUMBER', item_id: Number(row.number_id), quantity: 1, unit_price: Number(row.price), line_total: Number(row.price) }; }
            });
            const accessoryQ: any = await this.dao.executeQuery(`SELECT aoi.*,
                (SELECT image_id FROM accessory_images ai WHERE ai.accessory_id=aoi.accessory_id ORDER BY ai.is_primary DESC,ai.sort_order,image_id LIMIT 1) AS primary_image_id,
                CASE WHEN aoi.delivered_at IS NOT NULL AND UTC_TIMESTAMP()<=DATE_ADD(aoi.delivered_at,INTERVAL 7 DAY) AND aoi.fulfillment_status='DELIVERED' THEN 1 ELSE 0 END AS can_return
                FROM accessory_order_items aoi WHERE aoi.order_id=?`, [Number(payload.order_id)]);
            data.items.push(...(accessoryQ.rows || []).map((row: any) => ({ ...row,item_type:'ACCESSORY',item_id:Number(row.accessory_id),offer_price:Number(row.unit_price),can_return:Boolean(Number(row.can_return)) })));
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

let purchaseLifecycleTimer: any;
export function startPurchaseLifecycle() {
    if (purchaseLifecycleTimer) return;
    const service = new Orders();
    service.reconcilePurchases().catch(() => undefined);
    purchaseLifecycleTimer = setInterval(() => service.reconcilePurchases().catch(() => undefined), 60_000);
    purchaseLifecycleTimer.unref?.();
}
