import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Banners {
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
                `SELECT * FROM banners ${where} ORDER BY sort_order ASC, banner_id ASC`, []
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
            if (payload.banner_id) {
                await this.dao.executeQuery(
                    `UPDATE banners SET title=?, subtitle=?, image=?, cta_text=?, cta_link=?, is_active=?, sort_order=? WHERE banner_id=?`,
                    [payload.title || null, payload.subtitle || null, payload.image || null, payload.cta_text || null,
                     payload.cta_link || null, payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0, Number(payload.banner_id)]
                );
                resModel.data = { banner_id: Number(payload.banner_id) };
            } else {
                const q: any = await this.dao.executeQuery(
                    `INSERT INTO banners (title, subtitle, image, cta_text, cta_link, is_active, sort_order) VALUES (?,?,?,?,?,?,?)`,
                    [payload.title || null, payload.subtitle || null, payload.image || null, payload.cta_text || null,
                     payload.cta_link || null, payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0]
                );
                resModel.data = { banner_id: q.insertId };
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

    async remove(payload: { banner_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            await this.dao.executeQuery(`DELETE FROM banners WHERE banner_id = ?`, [Number(payload.banner_id)]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
