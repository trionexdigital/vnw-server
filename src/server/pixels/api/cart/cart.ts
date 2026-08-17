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
            const numberItems = (q.rows || []).map((row: any) => ({
                ...decorateNumberCategories(row), item_type: 'NUMBER', item_id: Number(row.number_id), quantity: 1,
                unit_price: Number(row.offer_price), line_total: Number(row.offer_price),
            }));
            const accessoryQ: any = await this.dao.executeQuery(
                `SELECT aci.accessory_cart_item_id,p.accessory_id,p.slug,p.name,p.brand,p.model,p.sku,p.offer_price,p.mrp,
                        p.stock,p.reserved_stock,(p.stock-p.reserved_stock) AS available_stock,p.status,aci.quantity,
                        (SELECT image_id FROM accessory_images ai WHERE ai.accessory_id=p.accessory_id ORDER BY ai.is_primary DESC,ai.sort_order,image_id LIMIT 1) AS primary_image_id
                 FROM accessory_cart_items aci INNER JOIN accessory_products p ON p.accessory_id=aci.accessory_id
                 WHERE aci.cart_id=? ORDER BY aci.added_at DESC`, [cartId]);
            const accessoryItems = (accessoryQ.rows || []).map((row: any) => ({
                ...row, item_type: 'ACCESSORY', item_id: Number(row.accessory_id), quantity: Number(row.quantity),
                unit_price: Number(row.offer_price), line_total: Number(row.offer_price) * Number(row.quantity),
                available_stock: Math.max(0, Number(row.available_stock)),
            }));
            const items = [...numberItems, ...accessoryItems];
            const subtotal = items.reduce((s: number, x: any) => s + Number(x.line_total), 0);
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

    async addAccessory(payload: { user_id: number, accessory_id: number, quantity?: number }) {
        const resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.accessory_id); const quantity = Math.min(10, Math.max(1, Math.floor(Number(payload.quantity) || 1)));
            const cartId = await this.getCartId(payload.user_id);
            const q: any = await this.dao.executeQuery("SELECT stock,reserved_stock,status FROM accessory_products WHERE accessory_id=?", [id]);
            const product = q.rows?.[0];
            if (!product || product.status !== 'ACTIVE') throw new Error('Accessory is not available.');
            if (Number(product.stock) - Number(product.reserved_stock) < quantity) throw new Error('Requested quantity is not available.');
            await this.dao.executeQuery(`INSERT INTO accessory_cart_items (cart_id,accessory_id,quantity) VALUES (?,?,?)
                ON DUPLICATE KEY UPDATE quantity=LEAST(10,quantity+VALUES(quantity))`, [cartId, id, quantity]);
            const current: any = await this.dao.executeQuery('SELECT quantity FROM accessory_cart_items WHERE cart_id=? AND accessory_id=?', [cartId, id]);
            if (Number(current.rows?.[0]?.quantity) > Number(product.stock) - Number(product.reserved_stock)) {
                await this.dao.executeQuery('UPDATE accessory_cart_items SET quantity=? WHERE cart_id=? AND accessory_id=?', [Math.max(1, Number(product.stock) - Number(product.reserved_stock)), cartId, id]);
            }
            resModel.status = 1; resModel.info = 'Accessory added to cart.'; resModel.data = (await this.list(payload)).data;
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    async updateAccessory(payload: { user_id: number, accessory_id: number, quantity: number }) {
        const resModel = this.masterModel.getResponseModel();
        try {
            const cartId = await this.getCartId(payload.user_id); const id = Number(payload.accessory_id);
            const quantity = Math.min(10, Math.max(0, Math.floor(Number(payload.quantity) || 0)));
            if (!quantity) await this.dao.executeQuery('DELETE FROM accessory_cart_items WHERE cart_id=? AND accessory_id=?', [cartId, id]);
            else {
                const q: any = await this.dao.executeQuery("SELECT stock,reserved_stock,status FROM accessory_products WHERE accessory_id=?", [id]);
                if (!q.rows?.[0] || q.rows[0].status !== 'ACTIVE' || Number(q.rows[0].stock) - Number(q.rows[0].reserved_stock) < quantity) throw new Error('Requested quantity is not available.');
                await this.dao.executeQuery('UPDATE accessory_cart_items SET quantity=? WHERE cart_id=? AND accessory_id=?', [quantity, cartId, id]);
            }
            resModel.status = 1; resModel.info = 'Cart updated.'; resModel.data = (await this.list(payload)).data;
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    async removeAccessory(payload: { user_id: number, accessory_id: number }) {
        return this.updateAccessory({ ...payload, quantity: 0 });
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
            await this.dao.executeQuery(`DELETE FROM accessory_cart_items WHERE cart_id = ?`, [cartId]);
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
