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
exports.PixelsContact = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
class PixelsContact {
    constructor() {
        this.mysqlDAO = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Public endpoint — a visitor submits a contact query for the admin to review. */
    submit(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const name = (payload.name || '').trim().slice(0, 150);
                const email = (payload.email || '').trim().slice(0, 255);
                const subject = (payload.subject || '').trim().slice(0, 200);
                const message = (payload.message || '').trim().slice(0, 4000);
                if (!name)
                    throw new Error('Please enter your name.');
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    throw new Error('Please enter a valid email address.');
                if (message.length < 5)
                    throw new Error('Please enter your message.');
                const ins = yield this.mysqlDAO.executeQuery(`INSERT INTO contact_messages (name, email, subject, message, status) VALUES (?, ?, ?, ?, 'NEW')`, [name, email, subject, message]);
                if (ins.status !== 1 || ins.insertId === 0)
                    throw new Error('Unable to submit your message. Please try again.');
                resModel.status = 1;
                resModel.info = 'Your message has been sent. Our team will get back to you soon.';
                resModel.data = { id: ins.insertId };
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
exports.PixelsContact = PixelsContact;
//# sourceMappingURL=contact.js.map