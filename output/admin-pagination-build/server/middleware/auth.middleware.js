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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const MasterModel_1 = require("../models/MasterModel");
const gtUtil = __importStar(require("../pixels-utility"));
const dotenv_1 = __importDefault(require("dotenv"));
const mysqlDao_1 = require("../db/mysql/mysqlDao");
dotenv_1.default.config();
exports.router = express_1.default.Router();
const logger = new gtUtil.Logger();
const methods = new gtUtil.Methods();
const cryptoJS = new gtUtil.CryptoJS();
const jwt = new gtUtil.JWT();
const masterModel = new MasterModel_1.MasterModel();
const mySqlMaster = new mysqlDao_1.MySqlMaster();
logger.log("## Auth Middleware Configuration : Start");
const BASE = '/vipnumberworld';
// Public, unauthenticated endpoints (no JWT required). The MD5 Authorization
// key is still validated by the middleware below for every request.
const BypassAuth = [
    `${BASE}/auth/login`,
    `${BASE}/auth/register`,
    `${BASE}/auth/forgot-request`,
    `${BASE}/referral/validate`,
    `${BASE}/contact/submit`,
    `${BASE}/numbers`, // public catalog browse/search/detail
    `${BASE}/categories/list`, // public category list
    `${BASE}/categories/classify`, // public, read-only category preview
    `${BASE}/testimonials/list`, // public testimonials
    `${BASE}/banners/list`, // public hero banners
    `${BASE}/carousel/list`, // public published carousel studio slides
    `${BASE}/carousel/asset`, // published carousel binary media
    `${BASE}/carousel/preview`, // published carousel static previews
    `${BASE}/reviews/by-number`, // public product reviews
    `${BASE}/site`, // public site config, newsletter, enquiry
    `${BASE}/prebooks/catalog`, // public NON-RTP catalog
    `${BASE}/private/resolve`, // bearer-link protected private number collection
    `${BASE}/payments/razorpay/webhook`, // verified via signature, not JWT
];
// Browser <img> requests cannot attach the rotating API authorization header.
// Keep this list restricted to read-only binary resources whose handlers accept
// only an integer id and never expose private account data.
const PublicBinaryPaths = [];
//setting response for all
exports.router.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let authorizationKey = '';
    let token = '';
    let model = masterModel.getResponseModel();
    let path = req.path;
    let jwtKeyValue = yield mySqlMaster.getEnvKey('MASTER_KEY');
    let jwtKey = jwtKeyValue ? (jwtKeyValue + '').trim() : '';
    let tokenExceptionPaths = [...BypassAuth];
    let skipJwtToken = false;
    let keyUTCDateMySql = '';
    let message = '';
    let userID = '';
    try {
        authorizationKey = req.headers['authorization'] + ''; // Express headers are auto converted to lowercase
        token = req.headers['token'] + ''; // Express headers are auto converted to lowercase
        //Skip on Status
        if (req.path === '/status' || req.path === '/vipnumberworld/status') {
            next();
            return;
        }
        if (PublicBinaryPaths.some((prefix) => req.path.startsWith(prefix))) {
            next();
            return;
        }
        //validating token
        if (authorizationKey == '') {
            throw 'AUTH ERROR: Authentication Key: BLANK';
        }
        else if (authorizationKey == 'undefined') {
            throw 'AUTH ERROR: Authentication Key: UNDEFINED';
        }
        else if (!authorizationKey) {
            throw 'AUTH ERROR: Authentication Key: NA';
        }
        // formatting the token string
        if (authorizationKey.startsWith('Bearer ')) {
            authorizationKey = authorizationKey.slice(7, authorizationKey.length); // Remove Bearer from string
        }
        // formatting the token string
        if (authorizationKey.startsWith('Basic ')) {
            authorizationKey = authorizationKey.slice(6, authorizationKey.length); // Remove Basic from string
        }
        // checking for final MD5 authorization key
        if (authorizationKey.trim().length != 32) {
            throw 'AUTH ERROR: INVALID LENGTH: Authentication Key';
        }
        keyUTCDateMySql = methods.getAuthKey();
        // validating the authorization key
        if (authorizationKey != keyUTCDateMySql) {
            message = message + ':AUTH ERROR: Authentication Key: INVALID or EXPIRED: Authentication=FAIL';
            throw 'AUTH ERROR: Authentication Key: INVALID or EXPIRED';
        }
        else {
            // Authentication success
            message = message + 'Authentication=SUCCESS';
        }
        tokenExceptionPaths.push('/' + keyUTCDateMySql);
        // checking if path exists in exception list
        for (let i = 0; i < tokenExceptionPaths.length; i++) {
            if (path.startsWith(tokenExceptionPaths[i])) {
                skipJwtToken = true;
            }
        }
        if (skipJwtToken) { // Check for exception path flag
            //logger message
            message = message + ': tokenExceptionPaths, TOKEN NOT REQUIRED';
            //going to next step
            next();
        }
        else { // JWT TOKEN Validation
            // reading JWT KEY from env file
            // jwtKey = process.env.MASTER_KEY + '';
            jwtKey = jwtKey.trim();
            if (jwtKey == '') {
                message = message + ':AUTH ERROR: TOKEN KEY: BLANK: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: BLANK';
            }
            else if (jwtKey == 'undefined') {
                message = message + ':AUTH ERROR: TOKEN KEY: UNDEFINED: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: UNDEFINED';
            }
            else if (!jwtKey) {
                message = message + ':AUTH ERROR: TOKEN KEY: NA: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: NA';
            }
            //validating token
            if (token == '') {
                throw 'AUTH ERROR: TOKEN: BLANK';
            }
            else if (token == 'undefined') {
                throw 'AUTH ERROR: TOKEN: UNDEFINED';
            }
            else if (!token) {
                throw 'AUTH ERROR: TOKEN: NA';
            }
            // verifying the JST token (throws on invalid/expired -> caught -> 401)
            let tokenPayload = yield jwt.getJwtPayload(token);
            // Bind the authenticated identity to the request. Downstream handlers
            // MUST use req.authUserId rather than any client-supplied user_id.
            userID = tokenPayload.userID;
            req.authUserId = Number(userID) || 0;
            let resToken = yield jwt.getJwtToken({ userID: userID, dt: new Date() });
            res.setHeader("token", resToken);
            //logger message
            message = message + ': JWT=SUCCESS';
            //going to next step
            next();
        }
        message = message + ': AUTH=SUCCESS (authorizationKey: ' + authorizationKey + ': token: ' + token + ': keyUTCDateMySql: ' + keyUTCDateMySql + ')';
    }
    catch (error) {
        message = message + ': AUTH=FAIL (authorizationKey: ' + authorizationKey + ': token: ' + token + ': keyUTCDateMySql: ' + keyUTCDateMySql + ')';
        model.status = gtUtil.Constants.AUTH_ERROR;
        model.info = JSON.stringify(error);
        return res.status(gtUtil.Constants.HTTP_UNAUTHORIZED).json(model);
    }
    finally {
        try {
            logger.log('userID=' + userID + ':: message=' + message + ':: req=' + JSON.stringify(masterModel.getRequestModel(req)) + ':: resModel=' + JSON.stringify(model));
        }
        catch (error) {
            logger.log('catch: auth logging:: ' + error + ':: ' + JSON.stringify(error) + ':: ' + JSON.stringify(model));
        }
    }
}));
//# sourceMappingURL=auth.middleware.js.map