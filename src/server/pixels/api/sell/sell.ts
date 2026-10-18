import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { Numbers } from '../numbers/numbers';
import { pushNotification } from '../notifications/notifications';
import { creditWallet } from '../wallet/wallet';
import { decorateNumberCategories, normalizeIndianNumber } from '../categories/categoryClassifier';

const SELL_REQUEST_COLUMNS = `s.request_id, s.user_id, s.number_value, s.display_number, s.operator,
    s.asking_price, s.description, s.contact_phone, s.status, s.admin_id, s.admin_note,
    s.offer_price, s.buy_price, s.number_id, s.created_at, s.processed_at`;

function decorateSellRequest(row: Record<string, any>) {
    try { return decorateNumberCategories(row); }
    catch { return decorateNumberCategories(row, ['unique-numbers']); }
}

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
            const number_value = normalizeIndianNumber(payload.number_value ?? payload.display_number);
            const display_number = String(payload.display_number || number_value).trim();
            if (normalizeIndianNumber(display_number) !== number_value) {
                throw new Error('Display number must match the submitted mobile number.');
            }
            const asking = Number(payload.asking_price) || 0;
            if (asking <= 0) throw new Error('Please enter your expected price.');

            const q: any = await this.dao.executeQuery(
                `INSERT INTO sell_requests (user_id, number_value, display_number, operator, asking_price, description, contact_phone, status)
                 VALUES (?,?,?,?,?,?,?, 'PENDING')`,
                [Number(payload.user_id), number_value, display_number, payload.operator || null,
                 asking, payload.description || null, payload.contact_phone || null]);
            if (q.status !== 1 || q.insertId === 0) throw new Error('Unable to submit your request. Please try again.');

            await pushNotification({
                user_id: Number(payload.user_id), type: 'sell',
                title: 'Sell request submitted',
                message: `Your request to sell ${display_number} is pending admin review. We'll notify you once it's reviewed.`,
            });

            const deprecationWarning = payload.category_id !== undefined
                ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                : undefined;
            if (deprecationWarning) this.logger.info(deprecationWarning);
            const automaticCategory = decorateNumberCategories({ number_value, display_number });
            resModel.status = 1;
            resModel.info = deprecationWarning || 'Sell request submitted for review.';
            resModel.data = {
                request_id: q.insertId,
                categories: automaticCategory.categories,
                primary_category: automaticCategory.primary_category,
                category_name: automaticCategory.category_name,
                category_slug: automaticCategory.category_slug,
                classifier_version: automaticCategory.classifier_version,
                ...(deprecationWarning ? { deprecation_warning: deprecationWarning } : {}),
            };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; this.logger.error(JSON.stringify(resModel)); }
        return resModel;
    }

    /** Lists the caller's own sell requests. */
    async mine(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT ${SELL_REQUEST_COLUMNS} FROM sell_requests s
                 WHERE s.user_id = ? ORDER BY s.created_at DESC`, [Number(payload.user_id)]);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = (q.rows || []).map(decorateSellRequest);
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
            const page = Math.max(1, Math.floor(Number(payload.page) || 1));
            const limit = Math.min(1000, Math.max(1, Math.floor(Number(payload.limit) || 20)));
            const count: any = await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM sell_requests s ${whereSql}`, params);
            const total = Number(count.rows?.[0]?.total || 0);
            const q: any = await this.dao.executeQuery(
                `SELECT ${SELL_REQUEST_COLUMNS}, u.full_name, u.email, u.phone AS user_phone
                 FROM sell_requests s
                 LEFT JOIN auth_user u ON u.user_id = s.user_id
                 ${whereSql} ORDER BY s.created_at DESC, s.request_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = { items: (q.rows || []).map(decorateSellRequest), total, page, limit, pages: Math.ceil(total / limit) };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /**
     * Admin approves a sell request → creates a live platform listing for the
     * number and links it back to the request. MRP defaults to the user's asking
     * price; the store-wide discount determines the catalog selling price.
     */
    async approve(payload: { user_id: number, request_id: number, offer_price?: number, mrp?: number, buy_price?: number, category_id?: unknown, admin_note?: string, rtp_status?: string, serviceable_pin_codes?: unknown }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const rid = Number(payload.request_id);
            const r: any = await this.dao.executeQuery(
                `SELECT ${SELL_REQUEST_COLUMNS} FROM sell_requests s WHERE s.request_id = ?`, [rid]);
            if (r.fetchedRows === 0) throw new Error('Sell request not found.');
            const reqRow = r.rows[0];
            if (reqRow.status !== 'PENDING') throw new Error('This request has already been processed.');

            const mrp = Number(payload.mrp) || Number(reqRow.asking_price) || 0;
            // What the platform pays the seller (credited to their wallet). Defaults to asking price.
            const buyPrice = Number(payload.buy_price) || Number(reqRow.asking_price) || 0;
            // Create the catalog listing owned by the platform (admin seller_id = 1).
            const created: any = await this.numbers.create({
                number_value: reqRow.number_value,
                display_number: reqRow.display_number,
                seller_id: 1,
                seller_type: 'ADMIN',
                title_label: 'VIP Number',
                rtp_status: payload.rtp_status || 'RTA',
                serviceable_pin_codes: payload.serviceable_pin_codes,
                mrp,
                description: reqRow.description,
                status: 'AVAILABLE',
            });
            if (created.status !== 1) throw new Error(created.info || 'Unable to create listing from this request.');
            const newNumberId = created.data?.number_id || null;
            const catalog: any = await this.dao.executeQuery(`SELECT offer_price FROM vip_numbers WHERE number_id=?`, [newNumberId]);
            const discountedPrice = Number(catalog.rows?.[0]?.offer_price) || 0;

            await this.dao.executeQuery(
                `UPDATE sell_requests SET status='APPROVED', admin_id=?, admin_note=?, offer_price=?, buy_price=?, number_id=?, processed_at=NOW()
                 WHERE request_id = ?`,
                [Number(payload.user_id), payload.admin_note || null, discountedPrice, buyPrice, newNumberId, rid]);

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

            const deprecationWarning = payload.category_id !== undefined
                ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                : undefined;
            if (deprecationWarning) this.logger.info(deprecationWarning);
            resModel.status = 1;
            resModel.info = deprecationWarning || 'Sell request approved.';
            resModel.data = {
                number_id: newNumberId,
                buy_price: buyPrice,
                categories: created.data?.categories || [],
                primary_category: created.data?.primary_category || null,
                category_name: created.data?.category_name || null,
                category_slug: created.data?.category_slug || null,
                classifier_version: created.data?.classifier_version || null,
                ...(deprecationWarning ? { deprecation_warning: deprecationWarning } : {}),
            };
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
