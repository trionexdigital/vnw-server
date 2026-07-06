import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

const PUBLIC_KEYS = ['SITE_TITLE', 'SITE_TAGLINE', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'WHATSAPP', 'PROMO_TEXT', 'PROMO_COUPON', 'SUPPORT_ADDRESS'];

export class Site {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

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
