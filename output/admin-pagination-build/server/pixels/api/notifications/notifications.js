"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifications = void 0;
exports.pushNotification = pushNotification;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const TABLE = 'notifications';
/**
 * Fire-and-forget helper used by other modules (wallet, admin, auth) to push a
 * notification to a user. Never throws — notification failures must not break
 * the originating action.
 */
function pushNotification(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const dao = new database_1.MySqlClient('pixels');
            yield dao.executeQuery(`INSERT INTO ${TABLE} (user_id, sender_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?, 'false')`, [payload.user_id, (_a = payload.sender_id) !== null && _a !== void 0 ? _a : 0, payload.type || 'info', payload.title, payload.message]);
        }
        catch (error) {
            new Logger_1.Logger().error('pushNotification failed: ' + error);
        }
    });
}
class Notifications {
    constructor() {
        this.mysqlDAO = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    register(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let queryModel = this.masterModel.getQueryModel();
            let resModel = this.masterModel.getResponseModel();
            try {
                if (!payload || !payload.user_id)
                    throw new Error('user_id is required');
                const allowed = ['user_id', 'sender_id', 'type', 'title', 'message', 'is_read'];
                const keys = Object.keys(payload).filter((k) => allowed.includes(k));
                const cols = keys.join(', ');
                const placeholders = keys.map(() => '?').join(', ');
                const query = `INSERT INTO ${TABLE} (${cols}) VALUES (${placeholders})`;
                queryModel = yield this.mysqlDAO.executeQuery(query, keys.map((k) => payload[k]));
                if (queryModel.status == 1) {
                    resModel.status = 1;
                    resModel.info = 'OK';
                    resModel.data = { notification_id: queryModel.insertId };
                }
                else {
                    resModel.status = -3;
                    resModel.info = 'ERROR: DB Query: ' + JSON.stringify(queryModel);
                }
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (error) { }
            }
            return resModel;
        });
    }
    update(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let queryModel = this.masterModel.getQueryModel();
            let resModel = this.masterModel.getResponseModel();
            try {
                const records = Array.isArray(payload) ? payload : [payload];
                if (records.length === 0)
                    throw new Error('No record passed to update');
                const updateList = [];
                for (const record of records) {
                    if (!record.notification_id)
                        throw new Error('notification_id is required for update');
                    const keys = Object.keys(record).filter((k) => k !== 'notification_id');
                    if (keys.length === 0)
                        throw new Error('No fields to update');
                    const query = `UPDATE ${TABLE} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE notification_id = ?`;
                    queryModel = yield this.mysqlDAO.executeQuery(query, [...keys.map((k) => record[k]), record.notification_id]);
                    updateList.push(record.notification_id);
                }
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { updated: updateList };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (error) { }
            }
            return resModel;
        });
    }
    /** Marks all of a user's notifications as read. */
    markAllRead(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const userId = Number(payload.user_id);
                if (!userId)
                    throw new Error('user_id is required');
                yield this.mysqlDAO.executeQuery(`UPDATE ${TABLE} SET is_read = 'true' WHERE user_id = ? AND is_read = 'false'`, [userId]);
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (error) { }
            }
            return resModel;
        });
    }
    get(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                if (!payload || !payload.hasOwnProperty('user_id'))
                    throw new Error('user_id is required');
                const userId = Number(payload.user_id);
                const query = `SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 100`;
                const result = yield this.mysqlDAO.simpleQuery(query, [userId]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = Array.isArray(result.data) ? result.data : [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (error) { }
            }
            return resModel;
        });
    }
}
exports.Notifications = Notifications;
//# sourceMappingURL=notifications.js.map