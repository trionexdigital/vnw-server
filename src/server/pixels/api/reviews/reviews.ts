import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Reviews {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public: approved reviews for a number. */
    async byNumber(payload: { number_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload.number_id) throw new Error('number_id is required.');
            const q: any = await this.dao.executeQuery(
                `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 WHERE r.number_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC`, [Number(payload.number_id)]
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

    async create(payload: { user_id: number, number_id: number, rating: number, comment?: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const rating = Math.min(5, Math.max(1, Number(payload.rating) || 5));
            if (!payload.number_id) throw new Error('number_id is required.');
            await this.dao.executeQuery(
                `INSERT INTO reviews (user_id, number_id, rating, comment, status) VALUES (?,?,?,?, 'APPROVED')`,
                [payload.user_id, Number(payload.number_id), rating, String(payload.comment || '').slice(0, 1000)]
            );
            resModel.status = 1;
            resModel.info = 'Thanks for your review!';
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
