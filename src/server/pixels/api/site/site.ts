import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

const PUBLIC_KEYS = ['SITE_TITLE','SITE_TAGLINE','CONTACT_EMAIL','CONTACT_PHONE','WHATSAPP','PROMO_TEXT','PROMO_COUPON','SUPPORT_ADDRESS',
    'GLOBAL_NUMBER_DISCOUNT_PERCENT',
    'LEGAL_BUSINESS_NAME','LEGAL_REGISTERED_ADDRESS','LEGAL_JURISDICTION','LEGAL_EMAIL','GRIEVANCE_OFFICER_NAME','GRIEVANCE_EMAIL','GRIEVANCE_PHONE','GSTIN','CIN','POLICY_EFFECTIVE_DATE'];
const HERO_STATS_TTL_MS = 5 * 60 * 1000;

interface HeroStats {
    delivered_numbers: number;
    available_numbers: number;
    customers_served: number;
}

export class Site {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    private heroStatsCache: { data: HeroStats; expiresAt: number } | null = null;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public, non-sensitive site config used by the storefront (promo bar, WhatsApp, contact). */
    async settings() {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT key_id, value FROM env WHERE key_id IN (${PUBLIC_KEYS.map(() => '?').join(',')})`, PUBLIC_KEYS);
            const map: any = {};
            (q.rows || []).forEach((r: any) => map[r.key_id] = r.value);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = map;
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    /** Public, privacy-safe marketplace totals used by the home-page hero. */
    async heroStats() {
        let resModel = this.masterModel.getResponseModel();
        try {
            const now = Date.now();
            if (this.heroStatsCache && this.heroStatsCache.expiresAt > now) {
                resModel.status = 1; resModel.info = 'OK'; resModel.data = this.heroStatsCache.data;
                return resModel;
            }

            const q: any = await this.dao.executeQuery(
                `SELECT
                    (SELECT COUNT(*) FROM order_items WHERE item_status = 'TRANSFERRED') AS delivered_numbers,
                    (SELECT COUNT(*) FROM vip_numbers WHERE deleted_at IS NULL AND status='AVAILABLE' AND visibility_type='ONLINE') AS available_numbers,
                    (SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'COMPLETED') AS customers_served`,
                []
            );
            const row = q.rows?.[0] || {};
            const data: HeroStats = {
                delivered_numbers: Math.max(0, Number(row.delivered_numbers) || 0),
                available_numbers: Math.max(0, Number(row.available_numbers) || 0),
                customers_served: Math.max(0, Number(row.customers_served) || 0),
            };

            this.heroStatsCache = { data, expiresAt: now + HERO_STATS_TTL_MS };
            resModel.status = 1; resModel.info = 'OK'; resModel.data = data;
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        }
        return resModel;
    }

    /** Public newsletter signup (lead capture). */
    async subscribe(payload: { email: string, source?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const email = (payload.email || '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
            await this.dao.executeQuery(
                `INSERT IGNORE INTO newsletter_subscribers (email, source) VALUES (?, ?)`, [email, (payload.source || 'footer').slice(0, 32)]);
            resModel.status = 1; resModel.info = 'Subscribed! Watch your inbox for exclusive VIP number drops & offers.';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    /** Public enquiry / request-callback (optionally tied to a specific number). */
    async enquiry(payload: { name: string, phone?: string, email?: string, message?: string, number_id?: number, type?: string, subject?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const name = (payload.name || '').trim().slice(0, 96);
            const phone = (payload.phone || '').trim().slice(0, 20);
            const email = (payload.email || '').trim().slice(0, 128);
            if (!name) throw new Error('Please enter your name.');
            if (!phone && !email) throw new Error('Please provide a phone number or email.');
            const message = (payload.message || 'Enquiry / callback request').trim().slice(0, 2000);
            const type = (payload.type || 'ENQUIRY').toUpperCase().slice(0, 24);
            const subject = (payload.subject || (payload.number_id ? 'Number enquiry' : 'Callback request')).slice(0, 160);

            await this.dao.executeQuery(
                `INSERT INTO contact_messages (name, email, phone, subject, message, status, number_id, type) VALUES (?,?,?,?,?, 'NEW', ?, ?)`,
                [name, email || 'na@vipnumberworld.com', phone, subject, message, payload.number_id || null, type]);
            resModel.status = 1; resModel.info = 'Thank you! Our team will contact you shortly.';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
