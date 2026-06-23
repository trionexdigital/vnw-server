import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Wishlist {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    async list(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT w.wishlist_id, n.number_id, n.display_number, n.title_label, n.badge, n.mrp, n.offer_price,
                        n.discount_pct, n.numerology_sum, n.operator, n.status, n.stock, c.name AS category_name
                 FROM wishlist w JOIN vip_numbers n ON n.number_id = w.number_id
                 LEFT JOIN categories c ON c.category_id = n.category_id
                 WHERE w.user_id = ? ORDER BY w.created_at DESC`, [payload.user_id]
            );
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { items: q.rows || [], count: (q.rows || []).length };
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
            await this.dao.executeQuery(`INSERT IGNORE INTO wishlist (user_id, number_id) VALUES (?, ?)`, [payload.user_id, payload.number_id]);
            resModel.status = 1;
            resModel.info = 'Added to wishlist.';
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

    async remove(payload: { user_id: number, number_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.dao.executeQuery(`DELETE FROM wishlist WHERE user_id = ? AND number_id = ?`, [payload.user_id, payload.number_id]);
            resModel.status = 1;
            resModel.info = 'Removed from wishlist.';
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
}
