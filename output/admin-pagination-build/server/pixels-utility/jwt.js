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
exports.JWT = void 0;
const Logger_1 = require("./Logger");
const jwt = __importStar(require("jsonwebtoken"));
const mysqlDao_1 = require("../db/mysql/mysqlDao");
//reading JWT key from .env file
const mySqlMaster = new mysqlDao_1.MySqlMaster();
class JWT {
    constructor() {
        this.logger = new Logger_1.Logger();
        this.jwtKey = () => __awaiter(this, void 0, void 0, function* () {
            let key = ((yield mySqlMaster.getEnvKey('MASTER_KEY')) + '').toString();
            return key;
        });
    }
    getJwtToken(payLoad) {
        return __awaiter(this, void 0, void 0, function* () {
            let jwtExpiresInSec = 900; //default token is valid for 15 minutes
            let token = '';
            try {
                try {
                    let tmp = ((yield mySqlMaster.getEnvKey('JWT_TIME_OUT_SECONDS')) + '').toString();
                    // console.warn(jwt)
                    // console.warn(this.jwtKey)
                    jwtExpiresInSec = parseInt(tmp.trim(), 10);
                }
                catch (error) {
                    this.logger.log('getJwtToken: Error in setting jwtExpiresInSec time, setting default to 15 minutes(900 sec) : ' + error);
                    jwtExpiresInSec = 900;
                }
                //generating jwt toen for authentication
                token = jwt.sign(payLoad, yield this.jwtKey(), { expiresIn: '7d' } // this needs to be numeric value only in seconds
                );
                return token;
            }
            catch (error) {
                throw 'getJwtToken: ' + error;
            }
        });
    }
    getJwtPayload(token) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                //validating token
                if (!token || token === '' || token === 'undefined' || token === 'null') {
                    throw 'ERROR: INVALID JWT';
                }
                const key = yield this.jwtKey();
                if (!key || key === '' || key === 'undefined') {
                    throw 'ERROR: INVALID JWT KEY';
                }
                // Synchronously verify the signature + expiry. jwt.verify THROWS on
                // any invalid/expired/tampered token — which propagates to the caller
                // (the auth middleware) and results in a 401. The decoded payload
                // (containing the real userID set at login) is returned to the caller.
                const decoded = jwt.verify(token, key);
                if (!decoded || typeof decoded !== 'object' || !decoded.userID) {
                    throw 'ERROR: JWT MISSING SUBJECT';
                }
                return decoded;
            }
            catch (error) {
                this.logger.error('getJwtPayload: ' + error);
                throw 'AUTH ERROR: TOKEN INVALID OR EXPIRED';
            }
        });
    }
}
exports.JWT = JWT;
//# sourceMappingURL=jwt.js.map