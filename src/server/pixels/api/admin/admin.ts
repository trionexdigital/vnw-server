import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { Numbers } from '../numbers/numbers';
import { Categories } from '../categories/categories';
import { Testimonials } from '../testimonials/testimonials';
import { Banners } from '../banners/banners';
import { Orders } from '../orders/orders';
import { pushNotification } from '../notifications/notifications';

export class Admin {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    public numbers = new Numbers();
    public categories = new Categories();
    public testimonials = new Testimonials();
    public banners = new Banners();
    public orders = new Orders();

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    // ---------- Dashboard ----------
    async dashboard(_payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const kpi: any = await this.dao.executeQuery(
                `SELECT
                  (SELECT COUNT(*) FROM auth_user) AS users,
                  (SELECT COUNT(*) FROM auth_user WHERE role='DEALER') AS dealers,
                  (SELECT COUNT(*) FROM vip_numbers) AS numbers,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='AVAILABLE') AS available,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='SOLD') AS sold,
                  (SELECT COUNT(*) FROM vip_numbers WHERE status='PENDING_APPROVAL') AS pending_approval,
                  (SELECT COUNT(*) FROM orders) AS orders,
                  (SELECT COUNT(*) FROM orders WHERE payment_status='PAID') AS paid_orders,
                  (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='PAID') AS revenue`, []
            );
            const recentOrders: any = await this.dao.executeQuery(
                `SELECT o.order_id, o.order_no, o.total, o.status, o.payment_status, o.created_at, u.full_name
                 FROM orders o LEFT JOIN auth_user u ON u.user_id = o.user_id ORDER BY o.created_at DESC LIMIT 8`, []
            );
            const topNumbers: any = await this.dao.executeQuery(
                `SELECT number_id, display_number, views, offer_price, status FROM vip_numbers ORDER BY views DESC LIMIT 6`, []
            );
            // last 6 months revenue trend
            const trend: any = await this.dao.executeQuery(
                `SELECT DATE_FORMAT(created_at,'%Y-%m') AS month, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
                 FROM orders WHERE payment_status='PAID' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY month ORDER BY month ASC`, []
            );
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { kpi: kpi.rows?.[0] || {}, recent_orders: recentOrders.rows || [], top_numbers: topNumbers.rows || [], trend: trend.rows || [] };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    // ---------- Numbers ----------
    async numbersList(payload: any) { return this.numbers.list({ ...payload, status: payload.status || 'ALL' }); }
    async numberSave(payload: any) {
        return payload.number_id ? this.numbers.update(payload) : this.numbers.create({ ...payload, seller_id: payload.user_id, seller_type: 'ADMIN', status: payload.status || 'AVAILABLE' });
    }
    async numberDelete(payload: any) { return this.numbers.remove({ number_id: payload.number_id }); }
    async numberApprove(payload: any) {
        const r = await this.numbers.update({ number_id: payload.number_id, status: 'AVAILABLE' });
        const n: any = await this.dao.executeQuery(`SELECT seller_id, display_number FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
        if (n.rows?.[0]) await pushNotification({ user_id: n.rows[0].seller_id, type: 'listing', title: 'Listing approved ✅', message: `Your number ${n.rows[0].display_number} is now live on the marketplace.` });
        return r;
    }
    async numberReject(payload: any) {
        const r = await this.numbers.update({ number_id: payload.number_id, status: 'REJECTED' });
        const n: any = await this.dao.executeQuery(`SELECT seller_id, display_number FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
        if (n.rows?.[0]) await pushNotification({ user_id: n.rows[0].seller_id, type: 'listing', title: 'Listing rejected', message: `Your number ${n.rows[0].display_number} was not approved. Please review and edit it.` });
        return r;
    }

    // ---------- Orders ----------
    async ordersList(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const where: string[] = []; const params: any[] = [];
            if (payload.status) { where.push('o.status = ?'); params.push(String(payload.status).toUpperCase()); }
            if (payload.q) { where.push('o.order_no LIKE ?'); params.push('%' + payload.q + '%'); }
            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
            const q: any = await this.dao.executeQuery(
                `SELECT o.*, u.full_name FROM orders o LEFT JOIN auth_user u ON u.user_id = o.user_id ${whereSql} ORDER BY o.created_at DESC LIMIT 200`, params);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async orderDetail(payload: any) { return this.orders.detail({ user_id: 0, order_id: payload.order_id, is_admin: true }); }
    async orderUpdateStatus(payload: { order_id: number, status: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const status = String(payload.status).toUpperCase();
            await this.dao.executeQuery(`UPDATE orders SET status = ? WHERE order_id = ?`, [status, Number(payload.order_id)]);
            if (status === 'COMPLETED') await this.dao.executeQuery(`UPDATE order_items SET item_status='TRANSFERRED' WHERE order_id = ?`, [Number(payload.order_id)]);
            const o: any = await this.dao.executeQuery(`SELECT user_id, order_no FROM orders WHERE order_id = ?`, [Number(payload.order_id)]);
            if (o.rows?.[0]) await pushNotification({ user_id: o.rows[0].user_id, type: 'order', title: 'Order update', message: `Your order ${o.rows[0].order_no} is now ${status}.` });
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Users ----------
    async usersList(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const where: string[] = []; const params: any[] = [];
            if (payload.role) { where.push('role = ?'); params.push(String(payload.role).toUpperCase()); }
            if (payload.q) { where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)'); params.push('%' + payload.q + '%', '%' + payload.q + '%', '%' + payload.q + '%'); }
            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
            const q: any = await this.dao.executeQuery(
                `SELECT user_id, full_name, email, phone, role, status, referral_code, created_at FROM auth_user ${whereSql} ORDER BY created_at DESC LIMIT 300`, params);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async userSetRole(payload: { target_id: number, role: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const role = String(payload.role).toUpperCase();
            if (!['ADMIN', 'USER', 'DEALER', 'SYSTEM'].includes(role)) throw new Error('Invalid role.');
            await this.dao.executeQuery(`UPDATE auth_user SET role = ? WHERE user_id = ?`, [role, Number(payload.target_id)]);
            if (role === 'DEALER') await this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id, kyc_status) VALUES (?, 'PENDING')`, [Number(payload.target_id)]);
            resModel.status = 1; resModel.info = 'Role updated.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async userSetStatus(payload: { target_id: number, status: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const status = String(payload.status).toUpperCase();
            if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(status)) throw new Error('Invalid status.');
            await this.dao.executeQuery(`UPDATE auth_user SET status = ? WHERE user_id = ?`, [status, Number(payload.target_id)]);
            resModel.status = 1; resModel.info = 'Status updated.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Dealers ----------
    async dealersList(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT d.*, u.full_name, u.email, u.phone,
                        (SELECT COUNT(*) FROM vip_numbers n WHERE n.seller_id = d.dealer_id) AS listings
                 FROM dealer_profiles d LEFT JOIN auth_user u ON u.user_id = d.dealer_id ORDER BY d.created_at DESC`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async dealerKyc(payload: { dealer_id: number, kyc_status: string, commission_pct?: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const status = String(payload.kyc_status).toUpperCase();
            const fields = ['kyc_status = ?']; const params: any[] = [status];
            if (payload.commission_pct !== undefined) { fields.push('commission_pct = ?'); params.push(Number(payload.commission_pct)); }
            params.push(Number(payload.dealer_id));
            await this.dao.executeQuery(`UPDATE dealer_profiles SET ${fields.join(', ')} WHERE dealer_id = ?`, params);
            await pushNotification({ user_id: Number(payload.dealer_id), type: 'kyc', title: 'KYC ' + status, message: `Your dealer KYC status is now ${status}.` });
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Payouts ----------
    async payoutsList(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT p.*, u.full_name, u.email FROM dealer_payouts p LEFT JOIN auth_user u ON u.user_id = p.dealer_id ORDER BY p.requested_at DESC`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async payoutUpdate(payload: { payout_id: number, status: string, reference?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const status = String(payload.status).toUpperCase();
            await this.dao.executeQuery(
                `UPDATE dealer_payouts SET status = ?, reference = ?, processed_at = NOW() WHERE payout_id = ?`,
                [status, payload.reference || null, Number(payload.payout_id)]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Reviews ----------
    async reviewsList(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const where = payload.status ? 'WHERE r.status = ?' : '';
            const params = payload.status ? [String(payload.status).toUpperCase()] : [];
            const q: any = await this.dao.executeQuery(
                `SELECT r.*, u.full_name, n.display_number FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 LEFT JOIN vip_numbers n ON n.number_id = r.number_id ${where} ORDER BY r.created_at DESC LIMIT 200`, params);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async reviewModerate(payload: { review_id: number, status: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const status = String(payload.status).toUpperCase();
            if (status === 'DELETE') await this.dao.executeQuery(`DELETE FROM reviews WHERE review_id = ?`, [Number(payload.review_id)]);
            else await this.dao.executeQuery(`UPDATE reviews SET status = ? WHERE review_id = ?`, [status, Number(payload.review_id)]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Contact messages ----------
    async messagesList(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(`SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Coupons ----------
    async couponsList(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(`SELECT * FROM coupons ORDER BY coupon_id DESC`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async couponSave(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const code = String(payload.code || '').trim().toUpperCase();
            if (!code) throw new Error('Coupon code is required.');
            const type = String(payload.type || 'PERCENT').toUpperCase() === 'FLAT' ? 'FLAT' : 'PERCENT';
            const params = [code, type, Number(payload.value) || 0, Number(payload.min_order) || 0,
                payload.max_discount ? Number(payload.max_discount) : null, payload.usage_limit ? Number(payload.usage_limit) : null,
                payload.expires_at || null, payload.is_active === false ? 0 : 1];
            if (payload.coupon_id) {
                await this.dao.executeQuery(
                    `UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_discount=?, usage_limit=?, expires_at=?, is_active=? WHERE coupon_id=?`,
                    [...params, Number(payload.coupon_id)]);
                resModel.data = { coupon_id: Number(payload.coupon_id) };
            } else {
                const q: any = await this.dao.executeQuery(
                    `INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at, is_active) VALUES (?,?,?,?,?,?,?,?)`, params);
                if (q.insertId === 0) throw new Error(q.info && /duplicate/i.test(q.info) ? 'This coupon code already exists.' : 'Unable to save coupon.');
                resModel.data = { coupon_id: q.insertId };
            }
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async couponDelete(payload: { coupon_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.dao.executeQuery(`DELETE FROM coupons WHERE coupon_id = ?`, [Number(payload.coupon_id)]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Newsletter subscribers ----------
    async newsletterList(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(`SELECT * FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 1000`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- Settings (env key/value) ----------
    async settingsGet(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const keys = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'SUPPORT_ADDRESS', 'PROMO_TEXT', 'PROMO_COUPON'];
            const q: any = await this.dao.executeQuery(
                `SELECT key_id, value FROM env WHERE key_id IN (${keys.map(() => '?').join(',')})`, keys);
            const map: any = {};
            (q.rows || []).forEach((r: any) => map[r.key_id] = r.value);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = map;
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
    async settingsSave(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const allowed = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'SUPPORT_ADDRESS', 'PROMO_TEXT', 'PROMO_COUPON'];
            for (const k of allowed) {
                if (payload[k] !== undefined) {
                    await this.dao.executeQuery(
                        `INSERT INTO env (key_id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [k, String(payload[k])]);
                }
            }
            resModel.status = 1; resModel.info = 'Settings saved.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
}
