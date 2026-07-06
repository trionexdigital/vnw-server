import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Categories {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public list with live available-count per category. */
    async list(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const onlyActive = payload?.all ? '' : 'WHERE c.is_active = 1';
            const q: any = await this.dao.executeQuery(
                `SELECT c.*, (SELECT COUNT(*) FROM vip_numbers n WHERE n.category_id = c.category_id AND n.status = 'AVAILABLE') AS number_count
                 FROM categories c ${onlyActive} ORDER BY c.sort_order ASC, c.name ASC`, []
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

    /** Admin upsert. */
    async save(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const name = String(payload.name || '').trim();
            if (!name) throw new Error('Category name is required.');
            const slug = String(payload.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '');

            if (payload.category_id) {
                await this.dao.executeQuery(
                    `UPDATE categories SET name = ?, slug = ?, icon = ?, description = ?, sort_order = ?, is_active = ? WHERE category_id = ?`,
                    [name, slug, payload.icon || null, payload.description || null, Number(payload.sort_order) || 0,
                     payload.is_active === false ? 0 : 1, Number(payload.category_id)]
                );
                resModel.data = { category_id: Number(payload.category_id) };
            } else {
                const q: any = await this.dao.executeQuery(
                    `INSERT INTO categories (name, slug, icon, description, sort_order, is_active) VALUES (?,?,?,?,?,?)`,
                    [name, slug, payload.icon || null, payload.description || null, Number(payload.sort_order) || 0, payload.is_active === false ? 0 : 1]
                );
                if (q.insertId === 0) throw new Error(q.info && /duplicate/i.test(q.info) ? 'A category with this slug already exists.' : 'Unable to save category.');
                resModel.data = { category_id: q.insertId };
            }
            resModel.status = 1;
            resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async remove(payload: { category_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload.category_id) throw new Error('category_id is required.');
            await this.dao.executeQuery(`DELETE FROM categories WHERE category_id = ?`, [Number(payload.category_id)]);
            resModel.status = 1;
            resModel.info = 'OK';
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
