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
exports.Approvals = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const notifications_1 = require("../notifications/notifications");
const actions_1 = require("./actions");
/**
 * EMPLOYEE deferred-action approval queue.
 *
 * Employees do not mutate data directly. Each intended action is recorded as a
 * PENDING approval_request. An ADMIN later approves (the action is replayed and
 * executed) or rejects (discarded). This guarantees nothing an employee does
 * takes effect without explicit admin sign-off.
 */
class Approvals {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    // ---------- EMPLOYEE ----------
    /** Employee submits an action for admin approval (nothing executes yet). */
    submit(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const key = String(payload.action_key || '');
                if (!(0, actions_1.isValidAction)(key))
                    throw new Error('Unknown or unsupported action.');
                const def = actions_1.ACTIONS[key];
                const actionPayload = payload.payload || {};
                const summary = def.summary(actionPayload);
                const q = yield this.dao.executeQuery(`INSERT INTO approval_requests (requested_by, action_key, summary, payload, status)
                 VALUES (?,?,?,?, 'PENDING')`, [Number(payload.user_id), key, summary.slice(0, 255), JSON.stringify(actionPayload)]);
                if (q.status !== 1 || q.insertId === 0)
                    throw new Error('Unable to submit for approval.');
                // Notify all admins that an approval is waiting.
                const admins = yield this.dao.executeQuery(`SELECT user_id FROM auth_user WHERE role = 'ADMIN'`, []);
                for (const a of (admins.rows || [])) {
                    yield (0, notifications_1.pushNotification)({
                        user_id: a.user_id, sender_id: Number(payload.user_id), type: 'approval',
                        title: 'Action needs approval',
                        message: `An employee requested: ${summary}`,
                    });
                }
                resModel.status = 1;
                resModel.info = 'Submitted for admin approval.';
                resModel.data = { approval_id: q.insertId };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            return resModel;
        });
    }
    /** Employee views their own submissions. */
    mine(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT approval_id, action_key, summary, status, review_note, created_at, reviewed_at
                 FROM approval_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 200`, [Number(payload.user_id)]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    // ---------- ADMIN ----------
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = [];
                const params = [];
                if (payload.status) {
                    where.push('a.status = ?');
                    params.push(String(payload.status).toUpperCase());
                }
                const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
                const q = yield this.dao.executeQuery(`SELECT a.*, u.full_name AS requested_by_name, u.email AS requested_by_email
                 FROM approval_requests a LEFT JOIN auth_user u ON u.user_id = a.requested_by
                 ${whereSql} ORDER BY a.created_at DESC LIMIT 300`, params);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Admin approves → the recorded action is replayed and executed now. */
    approve(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let resModel = this.masterModel.getResponseModel();
            try {
                const aid = Number(payload.approval_id);
                const r = yield this.dao.executeQuery(`SELECT * FROM approval_requests WHERE approval_id = ?`, [aid]);
                if (r.fetchedRows === 0)
                    throw new Error('Approval request not found.');
                const row = r.rows[0];
                if (row.status !== 'PENDING')
                    throw new Error('This request has already been reviewed.');
                if (!(0, actions_1.isValidAction)(row.action_key))
                    throw new Error('Action is no longer supported.');
                let actionPayload = {};
                try {
                    actionPayload = JSON.parse(row.payload || '{}');
                }
                catch (_c) {
                    actionPayload = {};
                }
                // Replay the action, attributing it to the approving admin.
                const result = yield actions_1.ACTIONS[row.action_key].execute(actionPayload, Number(payload.user_id));
                if (!result || result.status !== 1) {
                    throw new Error('Action execution failed: ' + ((result === null || result === void 0 ? void 0 : result.info) || 'unknown error'));
                }
                yield this.dao.executeQuery(`UPDATE approval_requests SET status='APPROVED', reviewed_by=?, result=?, reviewed_at=NOW() WHERE approval_id = ?`, [Number(payload.user_id), JSON.stringify((_a = result.data) !== null && _a !== void 0 ? _a : {}), aid]);
                yield (0, notifications_1.pushNotification)({
                    user_id: row.requested_by, sender_id: Number(payload.user_id), type: 'approval',
                    title: 'Action approved ✅',
                    message: `Your request "${row.summary}" was approved and applied.`,
                });
                resModel.status = 1;
                resModel.info = 'Approved and applied.';
                resModel.data = (_b = result.data) !== null && _b !== void 0 ? _b : {};
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            return resModel;
        });
    }
    reject(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const aid = Number(payload.approval_id);
                const q = yield this.dao.executeQuery(`UPDATE approval_requests SET status='REJECTED', reviewed_by=?, review_note=?, reviewed_at=NOW()
                 WHERE approval_id = ? AND status='PENDING'`, [Number(payload.user_id), payload.review_note || null, aid]);
                if (q.affectedRows === 0)
                    throw new Error('Request not found or already reviewed.');
                const r = yield this.dao.executeQuery(`SELECT requested_by, summary FROM approval_requests WHERE approval_id = ?`, [aid]);
                if ((_a = r.rows) === null || _a === void 0 ? void 0 : _a[0])
                    yield (0, notifications_1.pushNotification)({
                        user_id: r.rows[0].requested_by, sender_id: Number(payload.user_id), type: 'approval',
                        title: 'Action rejected',
                        message: `Your request "${r.rows[0].summary}" was rejected.` + (payload.review_note ? ` Note: ${payload.review_note}` : ''),
                    });
                resModel.status = 1;
                resModel.info = 'Rejected.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Approvals = Approvals;
//# sourceMappingURL=approvals.js.map