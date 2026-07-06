import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { Numbers } from '../numbers/numbers';
import { pushNotification } from '../notifications/notifications';
import { creditWallet } from '../wallet/wallet';

/**
 * "Sell your number" workflow. A USER offers a number they own to the platform.
 * The request stays PENDING until an ADMIN approves it — only then is a live
 * catalog listing created (owned by the platform). Approval is admin-only.
 */
export class Sell {
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

    // ---------- USER ----------

    /** A customer raises a request to sell their own number to us. */
    async create(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const number_value = String(payload.number_value || '').replace(/\s+/g, '');
            if (!number_value || number_value.length < 6) throw new Error('Please enter a valid number.');
            const display_number = String(payload.display_number || payload.number_value || '').trim();
            const asking = Number(payload.asking_price) || 0;
            if (asking <= 0) throw new Error('Please enter your expected price.');

            const q: any = await this.dao.executeQuery(
                `INSERT INTO sell_requests (user_id, number_value, display_number, operator, category_id, asking_price, description, contact_phone, status)
                 VALUES (?,?,?,?,?,?,?,?, 'PENDING')`,
                [Number(payload.user_id), number_value, display_number, payload.operator || null,
                 payload.category_id ? Number(payload.category_id) : null, asking,
                 payload.description || null, payload.contact_phone || null]);
            if (q.status !== 1 || q.insertId === 0) throw new Error('Unable to submit your request. Please try again.');

            await pushNotification({
                user_id: Number(payload.user_id), type: 'sell',
                title: 'Sell request submitted',
                message: `Your request to sell ${display_number} is pending admin review. We'll notify you once it's reviewed.`,
            });

            resModel.status = 1; resModel.info = 'Sell request submitted for review.'; resModel.data = { request_id: q.insertId };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; this.logger.error(JSON.stringify(resModel)); }
        return resModel;
    }

    /** Lists the caller's own sell requests. */
    async mine(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT s.*, c.name AS category_name FROM sell_requests s
                 LEFT JOIN categories c ON c.category_id = s.category_id
                 WHERE s.user_id = ? ORDER BY s.created_at DESC`, [Number(payload.user_id)]);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /** Cancels the caller's own pending request. */
    async cancel(payload: { user_id: number, request_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `UPDATE sell_requests SET status='CANCELLED', processed_at=NOW()
                 WHERE request_id = ? AND user_id = ? AND status='PENDING'`,
                [Number(payload.request_id), Number(payload.user_id)]);
            if (q.affectedRows === 0) throw new Error('Request not found or no longer cancellable.');
            resModel.status = 1; resModel.info = 'Request cancelled.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- ADMIN ----------

    async list(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const where: string[] = []; const params: any[] = [];
            if (payload.status) { where.push('s.status = ?'); params.push(String(payload.status).toUpperCase()); }
            if (payload.q) { where.push('(s.display_number LIKE ? OR s.number_value LIKE ?)'); params.push('%' + payload.q + '%', '%' + payload.q + '%'); }
            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
            const q: any = await this.dao.executeQuery(
                `SELECT s.*, u.full_name, u.email, u.phone AS user_phone, c.name AS category_name
                 FROM sell_requests s
                 LEFT JOIN auth_user u ON u.user_id = s.user_id
                 LEFT JOIN categories c ON c.category_id = s.category_id
                 ${whereSql} ORDER BY s.created_at DESC LIMIT 300`, params);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /**
     * Admin approves a sell request → creates a live platform listing for the
     * number and links it back to the request. `offer_price` is what the platform
     * lists it for (defaults to the user's asking price), `buy_price` optional.
     */
    async approve(payload: { user_id: number, request_id: number, offer_price?: number, mrp?: number, buy_price?: number, category_id?: number, admin_note?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const rid = Number(payload.request_id);
            const r: any = await this.dao.executeQuery(`SELECT * FROM sell_requests WHERE request_id = ?`, [rid]);
            if (r.fetchedRows === 0) throw new Error('Sell request not found.');
            const reqRow = r.rows[0];
            if (reqRow.status !== 'PENDING') throw new Error('This request has already been processed.');

            const offer = Number(payload.offer_price) || Number(reqRow.asking_price) || 0;
            const mrp = Number(payload.mrp) || offer;
            // What the platform pays the seller (credited to their wallet). Defaults to asking price.
            const buyPrice = Number(payload.buy_price) || Number(reqRow.asking_price) || 0;
            const categoryId = payload.category_id ? Number(payload.category_id) : (reqRow.category_id || null);

            // Create the catalog listing owned by the platform (admin seller_id = 1).
            const created: any = await this.numbers.create({
                number_value: reqRow.number_value,
                display_number: reqRow.display_number,
                category_id: categoryId,
                seller_id: 1,
                seller_type: 'ADMIN',
                title_label: 'VIP Number',
                mrp, offer_price: offer,
                operator: reqRow.operator,
                description: reqRow.description,
                status: 'AVAILABLE',
            });
            if (created.status !== 1) throw new Error(created.info || 'Unable to create listing from this request.');
            const newNumberId = created.data?.number_id || null;

            await this.dao.executeQuery(
                `UPDATE sell_requests SET status='APPROVED', admin_id=?, admin_note=?, offer_price=?, buy_price=?, number_id=?, processed_at=NOW()
                 WHERE request_id = ?`,
                [Number(payload.user_id), payload.admin_note || null, offer, buyPrice, newNumberId, rid]);

            // Pay the seller into their wallet (platform buys the number). Idempotent per request.
            let credited = false;
            if (buyPrice > 0) {
                credited = await creditWallet(
                    reqRow.user_id, buyPrice, 'SELL_PAYOUT', 'sell_request', rid,
                    `Sold ${reqRow.display_number} to VIP Number World`);
            }

            await pushNotification({
                user_id: reqRow.user_id, type: 'sell',
                title: 'Sell request approved ✅',
                message: credited
                    ? `Your number ${reqRow.display_number} was approved. ₹${buyPrice} has been credited to your wallet.`
                    : `Your number ${reqRow.display_number} was approved and is now listed.`,
            });

            resModel.status = 1; resModel.info = 'Sell request approved.'; resModel.data = { number_id: newNumberId, buy_price: buyPrice };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    async reject(payload: { user_id: number, request_id: number, admin_note?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const rid = Number(payload.request_id);
            const q: any = await this.dao.executeQuery(
                `UPDATE sell_requests SET status='REJECTED', admin_id=?, admin_note=?, processed_at=NOW()
                 WHERE request_id = ? AND status='PENDING'`,
                [Number(payload.user_id), payload.admin_note || null, rid]);
            if (q.affectedRows === 0) throw new Error('Request not found or already processed.');
            const r: any = await this.dao.executeQuery(`SELECT user_id, display_number FROM sell_requests WHERE request_id = ?`, [rid]);
            if (r.rows?.[0]) await pushNotification({
                user_id: r.rows[0].user_id, type: 'sell',
                title: 'Sell request rejected',
                message: `Your request to sell ${r.rows[0].display_number} was not approved.` + (payload.admin_note ? ` Note: ${payload.admin_note}` : ''),
            });
            resModel.status = 1; resModel.info = 'Sell request rejected.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
}
