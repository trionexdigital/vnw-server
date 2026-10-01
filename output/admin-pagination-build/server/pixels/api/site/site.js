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
exports.Site = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const PUBLIC_KEYS = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'PROMO_TEXT', 'PROMO_COUPON', 'SUPPORT_ADDRESS',
    'GLOBAL_NUMBER_DISCOUNT_PERCENT',
    'LEGAL_BUSINESS_NAME', 'LEGAL_REGISTERED_ADDRESS', 'LEGAL_JURISDICTION', 'LEGAL_EMAIL', 'GRIEVANCE_OFFICER_NAME', 'GRIEVANCE_EMAIL', 'GRIEVANCE_PHONE', 'GSTIN', 'CIN', 'POLICY_EFFECTIVE_DATE'];
const HERO_STATS_TTL_MS = 5 * 60 * 1000;
class Site {
    constructor() {
        this.heroStatsCache = null;
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Public, non-sensitive site config used by the storefront (promo bar, WhatsApp, contact). */
    settings() {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT key_id, value FROM env WHERE key_id IN (${PUBLIC_KEYS.map(() => '?').join(',')})`, PUBLIC_KEYS);
                const map = {};
                (q.rows || []).forEach((r) => map[r.key_id] = r.value);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = map;
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Public, privacy-safe marketplace totals used by the home-page hero. */
    heroStats() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                const now = Date.now();
                if (this.heroStatsCache && this.heroStatsCache.expiresAt > now) {
                    resModel.status = 1;
                    resModel.info = 'OK';
                    resModel.data = this.heroStatsCache.data;
                    return resModel;
                }
                const q = yield this.dao.executeQuery(`SELECT
                    (SELECT COUNT(*) FROM order_items WHERE item_status = 'TRANSFERRED') AS delivered_numbers,
                    (SELECT COUNT(*) FROM vip_numbers WHERE status = 'AVAILABLE' AND visibility_type='ONLINE') AS available_numbers,
                    (SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'COMPLETED') AS customers_served`, []);
                const row = ((_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) || {};
                const data = {
                    delivered_numbers: Math.max(0, Number(row.delivered_numbers) || 0),
                    available_numbers: Math.max(0, Number(row.available_numbers) || 0),
                    customers_served: Math.max(0, Number(row.customers_served) || 0),
                };
                this.heroStatsCache = { data, expiresAt: now + HERO_STATS_TTL_MS };
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = data;
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            return resModel;
        });
    }
    /** Public newsletter signup (lead capture). */
    subscribe(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const email = (payload.email || '').trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    throw new Error('Please enter a valid email address.');
                yield this.dao.executeQuery(`INSERT IGNORE INTO newsletter_subscribers (email, source) VALUES (?, ?)`, [email, (payload.source || 'footer').slice(0, 32)]);
                resModel.status = 1;
                resModel.info = 'Subscribed! Watch your inbox for exclusive VIP number drops & offers.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** Public enquiry / request-callback (optionally tied to a specific number). */
    enquiry(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const name = (payload.name || '').trim().slice(0, 96);
                const phone = (payload.phone || '').trim().slice(0, 20);
                const email = (payload.email || '').trim().slice(0, 128);
                if (!name)
                    throw new Error('Please enter your name.');
                if (!phone && !email)
                    throw new Error('Please provide a phone number or email.');
                const message = (payload.message || 'Enquiry / callback request').trim().slice(0, 2000);
                const type = (payload.type || 'ENQUIRY').toUpperCase().slice(0, 24);
                const subject = (payload.subject || (payload.number_id ? 'Number enquiry' : 'Callback request')).slice(0, 160);
                yield this.dao.executeQuery(`INSERT INTO contact_messages (name, email, phone, subject, message, status, number_id, type) VALUES (?,?,?,?,?, 'NEW', ?, ?)`, [name, email || 'na@vipnumberworld.com', phone, subject, message, payload.number_id || null, type]);
                resModel.status = 1;
                resModel.info = 'Thank you! Our team will contact you shortly.';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Site = Site;
//# sourceMappingURL=site.js.map