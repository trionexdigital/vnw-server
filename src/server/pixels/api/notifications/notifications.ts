import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

const TABLE = 'notifications';

/**
 * Fire-and-forget helper used by other modules (wallet, admin, auth) to push a
 * notification to a user. Never throws — notification failures must not break
 * the originating action.
 */
export async function pushNotification(payload: {
    user_id: number;
    title: string;
    message: string;
    type?: string;
    sender_id?: number;
}): Promise<void> {
    try {
        const dao = new MySqlClient('pixels');
        await dao.executeQuery(
            `INSERT INTO ${TABLE} (user_id, sender_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?, 'false')`,
            [payload.user_id, payload.sender_id ?? 0, payload.type || 'info', payload.title, payload.message]
        );
    } catch (error) {
        new Logger().error('pushNotification failed: ' + error);
    }
}

export class Notifications {
    private mysqlDAO: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.mysqlDAO = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    async register(payload: any) {
        let startMS = new Date().getTime();
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload || !payload.user_id) throw new Error('user_id is required');
            const allowed = ['user_id', 'sender_id', 'type', 'title', 'message', 'is_read'];
            const keys = Object.keys(payload).filter((k) => allowed.includes(k));
            const cols = keys.join(', ');
            const placeholders = keys.map(() => '?').join(', ');

            const query = `INSERT INTO ${TABLE} (${cols}) VALUES (${placeholders})`;
            queryModel = await this.mysqlDAO.executeQuery(query, keys.map((k) => payload[k]));

            if (queryModel.status == 1) {
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { notification_id: queryModel.insertId };
            } else {
                resModel.status = -3;
                resModel.info = 'ERROR: DB Query: ' + JSON.stringify(queryModel);
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    async update(payload: any) {
        let startMS = new Date().getTime();
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        try {
            const records: any[] = Array.isArray(payload) ? payload : [payload];
            if (records.length === 0) throw new Error('No record passed to update');

            const updateList: number[] = [];
            for (const record of records) {
                if (!record.notification_id) throw new Error('notification_id is required for update');
                const keys = Object.keys(record).filter((k) => k !== 'notification_id');
                if (keys.length === 0) throw new Error('No fields to update');
                const query = `UPDATE ${TABLE} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE notification_id = ?`;
                queryModel = await this.mysqlDAO.executeQuery(query, [...keys.map((k) => record[k]), record.notification_id]);
                updateList.push(record.notification_id);
            }
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { updated: updateList };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    /** Marks all of a user's notifications as read. */
    async markAllRead(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const userId = Number(payload.user_id);
            if (!userId) throw new Error('user_id is required');
            await this.mysqlDAO.executeQuery(
                `UPDATE ${TABLE} SET is_read = 'true' WHERE user_id = ? AND is_read = 'false'`, [userId]
            );
            resModel.status = 1;
            resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    async get(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload || !payload.hasOwnProperty('user_id')) throw new Error('user_id is required');
            const userId = Number(payload.user_id);

            const query = `SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 100`;
            const result: any = await this.mysqlDAO.simpleQuery(query, [userId]);

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = Array.isArray(result.data) ? result.data : [];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }
}
