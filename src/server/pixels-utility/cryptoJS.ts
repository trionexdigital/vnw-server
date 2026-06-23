import { Logger } from "./Logger";
import * as cryptoJS from "crypto-js";


export class CryptoJS {
    logger = new Logger();

    async encrypt(text: string, key: string) {
        let keyutf;
        let iv;
        let enc;
        let encStr;
        try {
            if (key == null || key == 'undefined' || key == '') {
                throw 'Invalid CryptoJS Key : ' + key;
            }
            keyutf = cryptoJS.enc.Utf8.parse(key);
            iv = cryptoJS.enc.Base64.parse(key);
            enc = cryptoJS.AES.encrypt(text, keyutf, { iv: iv });
            encStr = enc.toString();
            return encStr;
        } catch (error) {
            this.logger.log(JSON.stringify(error));
            throw 'encrypt:' + error;
        }
    }

    async decrypt(text: string, key: string) {
        let keyutf;
        let iv;
        let encStr;
        let dec;
        let decStr;
        let encObj: any;
        try {
            console.log('decrypt: 0: ' + text + ' : ' + key);
            if (key == null || key == 'undefined' || key == '') {
                throw 'Invalid CryptoJS Key : ' + key;
            }

            keyutf = cryptoJS.enc.Utf8.parse(key);
            console.log('decrypt: 1: ' + keyutf);
            iv = cryptoJS.enc.Base64.parse(key);
            console.log('decrypt: 2: ' + iv);
            encStr = cryptoJS.enc.Base64.parse(text);
            console.log('decrypt: 3' + encStr);
            encObj = { ciphertext: encStr, key: text }
            console.log('decrypt: 4' + encObj);
            dec = cryptoJS.AES.decrypt(encObj, keyutf, { iv: iv });
            console.log('decrypt: 5' + dec);
            decStr = cryptoJS.enc.Utf8.stringify(dec);
            console.log('decrypt: 6' + decStr);
            return decStr;
        } catch (error) {
            this.logger.log('decrypt:' + error);
            console.log('console decrypt:' + error);
            throw 'decrypt:' + error;
        }
    }

    MD5(text: string) {
        let key: string = '';
        try {
            key = cryptoJS.MD5(text) + '';
            return key + '';
        } catch (error) {
            this.logger.log('hashMD5:' + error);
            throw 'md5:' + error;
        }
    };


    decrypttest(text: string, key: string) {
        let keyutf;
        let iv;
        let encStr;
        let dec;
        let decStr;
        let encObj: any;
        try {
        //     let bytes = CryptoJS.AES.decrypt(this.encryptedData, this.secretKey);
        // console.warn('byte: ' + bytes)
        // let obJ = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

            keyutf = cryptoJS.enc.Utf8.parse(key);
            console.log('decrypt: 1: ' + keyutf);
            iv = cryptoJS.enc.Base64.parse(key);
            console.log('decrypt: 2: ' + iv);
            encStr = cryptoJS.enc.Base64.parse(text);
            console.log('decrypt: 3' + encStr);
            encObj = { ciphertext: encStr}
            console.log('decrypt: 4' + JSON.stringify(encObj));
            dec = cryptoJS.AES.decrypt(encObj, keyutf, { iv: iv });
            console.log('decrypt: 5' + dec);
            decStr = cryptoJS.enc.Utf8.stringify(dec);
            console.log('decrypt: 6' + decStr);
            return decStr;


        } catch (error) {
            console.log("decrypttest error: " + error)
        }
    }

}