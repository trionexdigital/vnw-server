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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Email = void 0;
const axios_1 = __importDefault(require("axios"));
const mysqlDao_1 = require("../db/mysql/mysqlDao");
const http = axios_1.default;
const queryModel = new mysqlDao_1.MySqlMaster();
class Email {
    sendEmail(contactModel) {
        return __awaiter(this, void 0, void 0, function* () {
            let emailServerUrl = yield queryModel.getEnvKey('EMAIL_URL');
            try {
                let body = {
                    token: 'contactus',
                    to: contactModel.to,
                    cc: contactModel.cc,
                    subject: contactModel.subject + ': Query',
                    message: contactModel.message
                };
                let res = yield http.post(emailServerUrl, body)
                    .then((response) => { return ('Mail Send Success'); })
                    .catch((err) => { return ('email Send Error:: ' + err); });
                return res;
            }
            catch (error) {
                console.warn('send email Error: ' + error);
            }
        });
    }
}
exports.Email = Email;
//# sourceMappingURL=email.js.map