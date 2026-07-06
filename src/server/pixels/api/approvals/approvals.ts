import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';
import { ACTIONS, isValidAction } from './actions';

/**
 * EMPLOYEE deferred-action approval queue.
 *
 * Employees do not mutate data directly. Each intended action is recorded as a
 * PENDING approval_request. An ADMIN later approves (the action is replayed and
 * executed) or rejects (discarded). This guarantees nothing an employee does
 * takes effect without explicit admin sign-off.
 */
export class Approvals {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    // ---------- EMPLOYEE ----------

    /** Employee submits an action for admin approval (nothing executes yet). */
    async submit(payload: { user_id: number, action_key: string, payload: any }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const key = String(payload.action_key || '');
            if (!isValidAction(key)) throw new Error('Unknown or unsupported action.');
            const def = ACTIONS[key];
            const actionPayload = payload.payload || {};
            const summary = def.summary(actionPayload);

            const q: any = await this.dao.executeQuery(
                `INSERT INTO approval_requests (requested_by, action_key, summary, payload, status)
                 VALUES (?,?,?,?, 'PENDING')`,
                [Number(payload.user_id), key, summary.slice(0, 255), JSON.stringify(actionPayload)]);
            if (q.status !== 1 || q.insertId === 0) throw new Error('Unable to submit for approval.');

            // Notify all admins that an approval is waiting.
            const admins: any = await this.dao.executeQuery(`SELECT user_id FROM auth_user WHERE role = 'ADMIN'`, []);
            for (const a of (admins.rows || [])) {
                await pushNotification({
                    user_id: a.user_id, sender_id: Number(payload.user_id), type: 'approval',
                    title: 'Action needs approval',
                    message: `An employee requested: ${summary}`,
                });
            }

            resModel.status = 1; resModel.info = 'Submitted for admin approval.'; resModel.data = { approval_id: q.insertId };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; this.logger.error(JSON.stringify(resModel)); }
        return resModel;
    }

    /** Employee views their own submissions. */
    async mine(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT approval_id, action_key, summary, status, review_note, created_at, reviewed_at
                 FROM approval_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 200`, [Number(payload.user_id)]);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    // ---------- ADMIN ----------

    async list(payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const where: string[] = []; const params: any[] = [];
            if (payload.status) { where.push('a.status = ?'); params.push(String(payload.status).toUpperCase()); }
            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
            const q: any = await this.dao.executeQuery(
                `SELECT a.*, u.full_name AS requested_by_name, u.email AS requested_by_email
                 FROM approval_requests a LEFT JOIN auth_user u ON u.user_id = a.requested_by
                 ${whereSql} ORDER BY a.created_at DESC LIMIT 300`, params);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /** Admin approves → the recorded action is replayed and executed now. */
    async approve(payload: { user_id: number, approval_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const aid = Number(payload.approval_id);
            const r: any = await this.dao.executeQuery(`SELECT * FROM approval_requests WHERE approval_id = ?`, [aid]);
            if (r.fetchedRows === 0) throw new Error('Approval request not found.');
            const row = r.rows[0];
            if (row.status !== 'PENDING') throw new Error('This request has already been reviewed.');
            if (!isValidAction(row.action_key)) throw new Error('Action is no longer supported.');

            let actionPayload: any = {};
            try { actionPayload = JSON.parse(row.payload || '{}'); } catch { actionPayload = {}; }

            // Replay the action, attributing it to the approving admin.
            const result = await ACTIONS[row.action_key].execute(actionPayload, Number(payload.user_id));
            if (!result || result.status !== 1) {
                throw new Error('Action execution failed: ' + (result?.info || 'unknown error'));
            }

            await this.dao.executeQuery(
                `UPDATE approval_requests SET status='APPROVED', reviewed_by=?, result=?, reviewed_at=NOW() WHERE approval_id = ?`,
                [Number(payload.user_id), JSON.stringify(result.data ?? {}), aid]);

            await pushNotification({
                user_id: row.requested_by, sender_id: Number(payload.user_id), type: 'approval',
                title: 'Action approved ✅',
                message: `Your request "${row.summary}" was approved and applied.`,
            });

            resModel.status = 1; resModel.info = 'Approved and applied.'; resModel.data = result.data ?? {};
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; this.logger.error(JSON.stringify(resModel)); }
        return resModel;
    }

    async reject(payload: { user_id: number, approval_id: number, review_note?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const aid = Number(payload.approval_id);
            const q: any = await this.dao.executeQuery(
                `UPDATE approval_requests SET status='REJECTED', reviewed_by=?, review_note=?, reviewed_at=NOW()
                 WHERE approval_id = ? AND status='PENDING'`,
                [Number(payload.user_id), payload.review_note || null, aid]);
            if (q.affectedRows === 0) throw new Error('Request not found or already reviewed.');
            const r: any = await this.dao.executeQuery(`SELECT requested_by, summary FROM approval_requests WHERE approval_id = ?`, [aid]);
            if (r.rows?.[0]) await pushNotification({
                user_id: r.rows[0].requested_by, sender_id: Number(payload.user_id), type: 'approval',
                title: 'Action rejected',
                message: `Your request "${r.rows[0].summary}" was rejected.` + (payload.review_note ? ` Note: ${payload.review_note}` : ''),
            });
            resModel.status = 1; resModel.info = 'Rejected.';
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
}
