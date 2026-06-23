
import HttpPost from 'axios';
import { MySqlMaster } from '../db/mysql/mysqlDao';

const http = HttpPost;
const queryModel = new MySqlMaster();

export class Email {

    async sendEmail(contactModel: any) {
        let emailServerUrl = await queryModel.getEnvKey('EMAIL_URL');
        try {
            let body = {
                token: 'contactus',
                to: contactModel.to,
                cc: contactModel.cc,
                subject: contactModel.subject + ': Query',
                message: contactModel.message
            };

            let res = await http.post(emailServerUrl, body)
                .then((response: any) => { return ('Mail Send Success' ) })
                .catch((err: any) => { return ('email Send Error:: ' + err) });

            return res;

        } catch (error) {
            console.warn('send email Error: ' + error)
        }
    }

}