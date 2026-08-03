import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';
import { Prebooks } from '../prebooks/prebooks';

export class Cart {
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

    private async getCartId(userId: number): Promise<number> {
        const q: any = await this.dao.executeQuery(`SELECT cart_id FROM carts WHERE user_id = ?`, [userId]);
        if (q.fetchedRows > 0) return q.rows[0].cart_id;
        const ins: any = await this.dao.executeQuery(`INSERT INTO carts (user_id) VALUES (?)`, [userId]);
        return ins.insertId;
    }

    async list(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const cartId = await this.getCartId(payload.user_id);
            const q: any = await this.dao.executeQuery(
                `SELECT ci.cart_item_id, n.number_id, n.number_value, n.display_number, n.title_label, n.badge, n.mrp, n.offer_price,
                        n.discount_pct, n.numerology_sum, n.operator, n.status, n.rtp_status, n.rtp_available_at
                 FROM cart_items ci JOIN vip_numbers n ON n.number_id = ci.number_id
                 WHERE ci.cart_id = ? ORDER BY ci.added_at DESC`, [cartId]
            );
            const items = (q.rows || []).map((row: any) => decorateNumberCategories(row));
            const subtotal = items.reduce((s: number, x: any) => s + Number(x.offer_price), 0);
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { items, count: items.length, subtotal };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async add(payload: { user_id: number, number_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.prebooks.reconcile();
            if (!payload.number_id) throw new Error('number_id is required.');
            const cartId = await this.getCartId(payload.user_id);
            // ensure the number exists & is available
            const chk: any = await this.dao.executeQuery(`SELECT status,rtp_status FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
            if (chk.fetchedRows === 0) throw new Error('Number not found.');
            if (chk.rows[0].status !== 'AVAILABLE') throw new Error('This number is no longer available.');
            if (chk.rows[0].rtp_status !== 'RTP') throw new Error('NON-RTP numbers must be pre-booked instead of added to cart.');
            await this.dao.executeQuery(`INSERT IGNORE INTO cart_items (cart_id, number_id) VALUES (?, ?)`, [cartId, payload.number_id]);
            resModel.status = 1;
            resModel.info = 'Added to cart.';
            resModel.data = await (await this.list(payload)).data;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Atomically validates and adds a complete curated pack to the user's cart. */
    async addMany(payload: { user_id: number, number_ids: number[] }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        let connection: any;
        try {
            await this.prebooks.reconcile();
            const ids = Array.isArray(payload.number_ids)
                ? payload.number_ids.map(Number).filter((id) => id > 0) : [];
            const uniqueIds = Array.from(new Set(ids));
            if (uniqueIds.length !== ids.length) throw new Error('The selected pack contains duplicate numbers.');
            if (uniqueIds.length < 2 || uniqueIds.length > 10) throw new Error('Choose a pack containing 2 to 10 numbers.');

            connection = await this.dao.getConnection();
            await connection.beginTransaction();
            const [numbers]: any = await connection.query(
                `SELECT number_id, display_number, status, stock, rtp_status FROM vip_numbers
                 WHERE number_id IN (${uniqueIds.map(() => '?').join(',')}) FOR UPDATE`, uniqueIds,
            );
            if ((numbers || []).length !== uniqueIds.length) throw new Error('One or more pack numbers no longer exist.');
            const unavailable = (numbers || []).find((number: any) => number.status !== 'AVAILABLE' || Number(number.stock) <= 0 || number.rtp_status !== 'RTP');
            if (unavailable) throw new Error(`${unavailable.display_number} is no longer available. Refresh the pack and try again.`);

            const [carts]: any = await connection.query('SELECT cart_id FROM carts WHERE user_id = ? FOR UPDATE', [payload.user_id]);
            let cartId = Number(carts?.[0]?.cart_id) || 0;
            if (!cartId) {
                const [insert]: any = await connection.query('INSERT INTO carts (user_id) VALUES (?)', [payload.user_id]);
                cartId = Number(insert.insertId);
            }
            for (const numberId of uniqueIds) {
                await connection.query('INSERT IGNORE INTO cart_items (cart_id, number_id) VALUES (?, ?)', [cartId, numberId]);
            }
            await connection.commit();
            resModel.status = 1;
            resModel.info = `${uniqueIds.length} numbers added to cart.`;
            resModel.data = (await this.list(payload)).data;
        } catch (error) {
            if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            if (connection) connection.release();
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async remove(payload: { user_id: number, number_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const cartId = await this.getCartId(payload.user_id);
            await this.dao.executeQuery(`DELETE FROM cart_items WHERE cart_id = ? AND number_id = ?`, [cartId, payload.number_id]);
            resModel.status = 1;
            resModel.info = 'Removed from cart.';
            resModel.data = (await this.list(payload)).data;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async clear(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const cartId = await this.getCartId(payload.user_id);
            await this.dao.executeQuery(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
            resModel.status = 1;
            resModel.info = 'Cart cleared.';
            resModel.data = { items: [], count: 0, subtotal: 0 };
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
