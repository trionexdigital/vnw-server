"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.CryptoJS = void 0;
const Logger_1 = require("./Logger");
const cryptoJS = __importStar(require("crypto-js"));
class CryptoJS {
    constructor() {
        this.logger = new Logger_1.Logger();
    }
    encrypt(text, key) {
        return __awaiter(this, void 0, void 0, function* () {
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
            }
            catch (error) {
                this.logger.log(JSON.stringify(error));
                throw 'encrypt:' + error;
            }
        });
    }
    decrypt(text, key) {
        return __awaiter(this, void 0, void 0, function* () {
            let keyutf;
            let iv;
            let encStr;
            let dec;
            let decStr;
            let encObj;
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
                encObj = { ciphertext: encStr, key: text };
                console.log('decrypt: 4' + encObj);
                dec = cryptoJS.AES.decrypt(encObj, keyutf, { iv: iv });
                console.log('decrypt: 5' + dec);
                decStr = cryptoJS.enc.Utf8.stringify(dec);
                console.log('decrypt: 6' + decStr);
                return decStr;
            }
            catch (error) {
                this.logger.log('decrypt:' + error);
                console.log('console decrypt:' + error);
                throw 'decrypt:' + error;
            }
        });
    }
    MD5(text) {
        let key = '';
        try {
            key = cryptoJS.MD5(text) + '';
            return key + '';
        }
        catch (error) {
            this.logger.log('hashMD5:' + error);
            throw 'md5:' + error;
        }
    }
    ;
    decrypttest(text, key) {
        let keyutf;
        let iv;
        let encStr;
        let dec;
        let decStr;
        let encObj;
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
            encObj = { ciphertext: encStr };
            console.log('decrypt: 4' + JSON.stringify(encObj));
            dec = cryptoJS.AES.decrypt(encObj, keyutf, { iv: iv });
            console.log('decrypt: 5' + dec);
            decStr = cryptoJS.enc.Utf8.stringify(dec);
            console.log('decrypt: 6' + decStr);
            return decStr;
        }
        catch (error) {
            console.log("decrypttest error: " + error);
        }
    }
}
exports.CryptoJS = CryptoJS;
//# sourceMappingURL=cryptoJS.js.map