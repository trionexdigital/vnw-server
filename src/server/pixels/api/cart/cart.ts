import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Cart {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
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
                `SELECT ci.cart_item_id, n.number_id, n.display_number, n.title_label, n.badge, n.mrp, n.offer_price,
                        n.discount_pct, n.numerology_sum, n.operator, n.status, c.name AS category_name
                 FROM cart_items ci JOIN vip_numbers n ON n.number_id = ci.number_id
                 LEFT JOIN categories c ON c.category_id = n.category_id
                 WHERE ci.cart_id = ? ORDER BY ci.added_at DESC`, [cartId]
            );
            const items = q.rows || [];
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
            if (!payload.number_id) throw new Error('number_id is required.');
            const cartId = await this.getCartId(payload.user_id);
            // ensure the number exists & is available
            const chk: any = await this.dao.executeQuery(`SELECT status FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
            if (chk.fetchedRows === 0) throw new Error('Number not found.');
            if (chk.rows[0].status !== 'AVAILABLE') throw new Error('This number is no longer available.');
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
