import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Testimonials {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    async list(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const where = payload?.all ? '' : 'WHERE is_active = 1';
            const q: any = await this.dao.executeQuery(
                `SELECT * FROM testimonials ${where} ORDER BY sort_order ASC, testimonial_id DESC`, []
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

    async save(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload.name || !payload.content) throw new Error('Name and content are required.');
            if (payload.testimonial_id) {
                await this.dao.executeQuery(
                    `UPDATE testimonials SET name=?, role=?, avatar=?, content=?, rating=?, is_active=?, sort_order=? WHERE testimonial_id=?`,
                    [payload.name, payload.role || null, payload.avatar || null, payload.content, Number(payload.rating) || 5,
                     payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0, Number(payload.testimonial_id)]
                );
                resModel.data = { testimonial_id: Number(payload.testimonial_id) };
            } else {
                const q: any = await this.dao.executeQuery(
                    `INSERT INTO testimonials (name, role, avatar, content, rating, is_active, sort_order) VALUES (?,?,?,?,?,?,?)`,
                    [payload.name, payload.role || null, payload.avatar || null, payload.content, Number(payload.rating) || 5,
                     payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0]
                );
                resModel.data = { testimonial_id: q.insertId };
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

    async remove(payload: { testimonial_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.dao.executeQuery(`DELETE FROM testimonials WHERE testimonial_id = ?`, [Number(payload.testimonial_id)]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
