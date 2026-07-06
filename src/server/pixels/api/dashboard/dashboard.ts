import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Dashboard {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Buyer dashboard summary: order stats, wishlist count, referral earnings, recent orders. */
    async summary(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const uid = payload.user_id;
            const statsQ: any = await this.dao.executeQuery(
                `SELECT COUNT(*) AS total_orders,
                        SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) AS paid_orders,
                        COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) AS total_spent
                 FROM orders WHERE user_id = ?`, [uid]
            );
            const wishQ: any = await this.dao.executeQuery(`SELECT COUNT(*) AS c FROM wishlist WHERE user_id = ?`, [uid]);
            const cartQ: any = await this.dao.executeQuery(
                `SELECT COUNT(*) AS c FROM cart_items ci JOIN carts c ON c.cart_id = ci.cart_id WHERE c.user_id = ?`, [uid]);
            const refQ: any = await this.dao.executeQuery(`SELECT COALESCE(SUM(amount),0) AS earned FROM referral_earnings WHERE user_id = ?`, [uid]);
            const recentQ: any = await this.dao.executeQuery(
                `SELECT order_id, order_no, total, status, payment_status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`, [uid]);

            const s = statsQ.rows?.[0] || {};
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                total_orders: Number(s.total_orders) || 0,
                paid_orders: Number(s.paid_orders) || 0,
                total_spent: Number(s.total_spent) || 0,
                wishlist_count: Number(wishQ.rows?.[0]?.c) || 0,
                cart_count: Number(cartQ.rows?.[0]?.c) || 0,
                referral_earned: Number(refQ.rows?.[0]?.earned) || 0,
                recent_orders: recentQ.rows || [],
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
}
