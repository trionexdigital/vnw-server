import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { Numbers } from '../numbers/numbers';

export class Dealer {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    private numbers: Numbers;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
        this.numbers = new Numbers();
    }

    async dashboard(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const did = payload.user_id;
            const listQ: any = await this.dao.executeQuery(
                `SELECT
                    COUNT(*) AS total_listings,
                    SUM(status='AVAILABLE') AS available,
                    SUM(status='PENDING_APPROVAL') AS pending,
                    SUM(status='SOLD') AS sold
                 FROM vip_numbers WHERE seller_id = ?`, [did]
            );
            const salesQ: any = await this.dao.executeQuery(
                `SELECT COALESCE(SUM(oi.price),0) AS gross, COALESCE(SUM(oi.commission_amount),0) AS commission, COUNT(*) AS units
                 FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
                 WHERE oi.seller_id = ? AND o.payment_status = 'PAID'`, [did]
            );
            const s = listQ.rows?.[0] || {}; const sl = salesQ.rows?.[0] || {};
            const gross = Number(sl.gross) || 0; const commission = Number(sl.commission) || 0;
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

    async listings(payload: { user_id: number }) {
        return this.numbers.list({ seller_id: payload.user_id, status: 'ALL', limit: 60, sort: 'newest' });
    }

    /** Dealer creates a listing → enters PENDING_APPROVAL for admin review. */
    async createListing(payload: any) {
        return this.numbers.create({
            ...payload,
            seller_id: payload.user_id,
            seller_type: 'DEALER',
            status: 'PENDING_APPROVAL',
            is_featured: 0,
        });
    }

    async updateListing(payload: any) {
        // Scope update to the dealer's own listings; force back to review if pricing/number changed.
        return this.numbers.update({ ...payload, owner_id: payload.user_id });
    }

    async deleteListing(payload: any) {
        return this.numbers.remove({ number_id: payload.number_id, owner_id: payload.user_id });
    }

    async sales(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT oi.order_item_id, oi.display_number, oi.price, oi.commission_amount, oi.item_status,
                        o.order_no, o.created_at, o.payment_status
                 FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
                 WHERE oi.seller_id = ? ORDER BY o.created_at DESC`, [payload.user_id]
            );
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = q.rows || [];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async getProfile(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(`SELECT * FROM dealer_profiles WHERE dealer_id = ?`, [payload.user_id]);
            if (q.fetchedRows === 0) {
                await this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id) VALUES (?)`, [payload.user_id]);
                const q2: any = await this.dao.executeQuery(`SELECT * FROM dealer_profiles WHERE dealer_id = ?`, [payload.user_id]);
                resModel.data = q2.rows?.[0] || {};
            } else {
                resModel.data = q.rows[0];
            }
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    async updateProfile(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.dao.executeQuery(`INSERT IGNORE INTO dealer_profiles (dealer_id) VALUES (?)`, [payload.user_id]);
            await this.dao.executeQuery(
                `UPDATE dealer_profiles SET business_name=?, gst_no=?, payout_method=?, payout_details=? WHERE dealer_id=?`,
                [payload.business_name || null, payload.gst_no || null, payload.payout_method || null,
                 payload.payout_details ? JSON.stringify(payload.payout_details) : null, payload.user_id]
            );
            resModel.status = 1; resModel.info = 'Profile updated.';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    async requestPayout(payload: { user_id: number, amount: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const amount = Number(payload.amount);
            if (!amount || amount <= 0) throw new Error('Enter a valid payout amount.');
            await this.dao.executeQuery(
                `INSERT INTO dealer_payouts (dealer_id, amount, status) VALUES (?,?, 'PENDING')`, [payload.user_id, amount]
            );
            resModel.status = 1; resModel.info = 'Payout request submitted.';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    async payouts(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT * FROM dealer_payouts WHERE dealer_id = ? ORDER BY requested_at DESC`, [payload.user_id]);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
