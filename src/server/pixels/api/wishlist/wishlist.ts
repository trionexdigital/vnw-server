import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';
import { resolvePrivateLinkWithConnection, OFFLINE_CATALOG_NAME } from '../privateLinks/privateLinks';

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
                `SELECT w.wishlist_id,w.private_link_id,n.number_id,n.number_value,n.display_number,n.title_label,n.badge,n.mrp,n.offer_price,
                        n.discount_pct,n.numerology_sum,n.operator,n.status,n.stock,n.visibility_type,n.rtp_status,n.rtp_available_at
                 FROM wishlist w JOIN vip_numbers n ON n.number_id = w.number_id
                 LEFT JOIN number_private_links pl ON pl.private_link_id=w.private_link_id
                 WHERE w.user_id = ? AND (n.visibility_type='ONLINE' OR (pl.name=? AND pl.revoked_at IS NULL AND (pl.expires_at IS NULL OR pl.expires_at>UTC_TIMESTAMP())))
                 ORDER BY w.created_at DESC`, [payload.user_id, OFFLINE_CATALOG_NAME]
            );
            const items = (q.rows || []).map((row: any) => decorateNumberCategories(row));
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { items, count: items.length };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async add(payload: { user_id: number, number_id: number, private_token?: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload.number_id) throw new Error('number_id is required.');
            const number: any = await this.dao.executeQuery('SELECT visibility_type FROM vip_numbers WHERE number_id=?', [payload.number_id]);
            if (!number.rows?.length) throw new Error('Number not found.');
            let privateLinkId: number | null = null;
            if (number.rows[0].visibility_type === 'OFFLINE') {
                const connection = await this.dao.getConnection();
                try {
                    const link = await resolvePrivateLinkWithConnection(connection, String(payload.private_token || ''), Number(payload.number_id));
                    if (!link) throw new Error('This Offline number is only available through its active private link.');
                    privateLinkId = Number(link.private_link_id);
                } finally { connection.release(); }
            }
            await this.dao.executeQuery(
                `INSERT INTO wishlist (user_id,number_id,private_link_id) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE private_link_id=VALUES(private_link_id)`, [payload.user_id,payload.number_id,privateLinkId],
            );
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
