import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class Referral {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public: validate a referral code and return the referrer's display name. */
    async validate(payload: { code: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const code = String(payload.code || '').trim();
            if (!code) throw new Error('Referral code is required.');
            const q: any = await this.dao.executeQuery(
                `SELECT full_name FROM auth_user WHERE referral_code = ?`, [code]
            );
            if (q.fetchedRows === 0) { resModel.status = -1; resModel.info = 'Invalid referral code.'; resModel.data = { valid: false }; return resModel; }
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { valid: true, referrer_name: q.rows[0].full_name };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Authenticated: my referral code, referred users, and earnings. */
    async mySummary(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const meQ: any = await this.dao.executeQuery(`SELECT referral_code FROM auth_user WHERE user_id = ?`, [payload.user_id]);
            const code = meQ.rows?.[0]?.referral_code || '';
            const teamQ: any = await this.dao.executeQuery(
                `SELECT user_id, full_name, created_at FROM auth_user WHERE referred_by = ? ORDER BY created_at DESC`, [payload.user_id]
            );
            const earnQ: any = await this.dao.executeQuery(
                `SELECT type, amount, order_id, created_at FROM referral_earnings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [payload.user_id]
            );
            const total = (earnQ.rows || []).reduce((s: number, x: any) => s + Number(x.amount), 0);
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                referral_code: code,
                referred_count: (teamQ.rows || []).length,
                referred: teamQ.rows || [],
                earnings: earnQ.rows || [],
                total_earned: Number(total.toFixed(2)),
            };
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
