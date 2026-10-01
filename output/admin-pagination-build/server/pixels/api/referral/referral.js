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
exports.Referral = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
class Referral {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Public: validate a referral code and return the referrer's display name. */
    validate(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const code = String(payload.code || '').trim();
                if (!code)
                    throw new Error('Referral code is required.');
                const q = yield this.dao.executeQuery(`SELECT full_name FROM auth_user WHERE referral_code = ?`, [code]);
                if (q.fetchedRows === 0) {
                    resModel.status = -1;
                    resModel.info = 'Invalid referral code.';
                    resModel.data = { valid: false };
                    return resModel;
                }
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { valid: true, referrer_name: q.rows[0].full_name };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    /** Authenticated: my referral code, referred users, and earnings. */
    mySummary(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const meQ = yield this.dao.executeQuery(`SELECT referral_code FROM auth_user WHERE user_id = ?`, [payload.user_id]);
                const code = ((_b = (_a = meQ.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.referral_code) || '';
                const teamQ = yield this.dao.executeQuery(`SELECT user_id, full_name, created_at FROM auth_user WHERE referred_by = ? ORDER BY created_at DESC`, [payload.user_id]);
                const earnQ = yield this.dao.executeQuery(`SELECT type, amount, order_id, created_at FROM referral_earnings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [payload.user_id]);
                const total = (earnQ.rows || []).reduce((s, x) => s + Number(x.amount), 0);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    referral_code: code,
                    referred_count: (teamQ.rows || []).length,
                    referred: teamQ.rows || [],
                    earnings: earnQ.rows || [],
                    total_earned: Number(total.toFixed(2)),
                };
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
                catch (e) { }
            }
            return resModel;
        });
    }
}
exports.Referral = Referral;
//# sourceMappingURL=referral.js.map