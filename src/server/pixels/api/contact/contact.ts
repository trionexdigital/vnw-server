import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

export class PixelsContact {
    private mysqlDAO: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.mysqlDAO = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public endpoint — a visitor submits a contact query for the admin to review. */
    async submit(payload: { name: string, email: string, subject?: string, message: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const name = (payload.name || '').trim().slice(0, 150);
            const email = (payload.email || '').trim().slice(0, 255);
            const subject = (payload.subject || '').trim().slice(0, 200);
            const message = (payload.message || '').trim().slice(0, 4000);

            if (!name) throw new Error('Please enter your name.');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
            if (message.length < 5) throw new Error('Please enter your message.');

            const ins: any = await this.mysqlDAO.executeQuery(
                `INSERT INTO contact_messages (name, email, subject, message, status) VALUES (?, ?, ?, ?, 'NEW')`,
                [name, email, subject, message]
            );
            if (ins.status !== 1 || ins.insertId === 0) throw new Error('Unable to submit your message. Please try again.');

            resModel.status = 1;
            resModel.info = 'Your message has been sent. Our team will get back to you soon.';
            resModel.data = { id: ins.insertId };
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
