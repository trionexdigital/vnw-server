import express, { Request, Response, NextFunction, Router } from "express";
import { parse, stringify } from 'flatted';
import { MasterModel } from "../models/MasterModel";
import * as gtUtil from "../pixels-utility";
import dotenv from "dotenv";
import { MySqlMaster } from '../db/mysql/mysqlDao';
dotenv.config();

export const router = express.Router();
const logger = new gtUtil.Logger();
const methods = new gtUtil.Methods();
const cryptoJS = new gtUtil.CryptoJS();
const jwt = new gtUtil.JWT();
const masterModel = new MasterModel();
const mySqlMaster: MySqlMaster = new MySqlMaster();

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
    `${BASE}/numbers`,          // public catalog browse/search/detail
    `${BASE}/categories/list`,  // public category list
    `${BASE}/testimonials/list`,// public testimonials
    `${BASE}/banners/list`,     // public hero banners
    `${BASE}/reviews/by-number`,// public product reviews
    `${BASE}/payments/razorpay/webhook`, // verified via signature, not JWT
];

//setting response for all
router.use(async (req: Request, res: Response, next: NextFunction) => {
    let authorizationKey: string = '';
    let token: string = '';
    let model = masterModel.getResponseModel();
    let path: string = req.path;
    let jwtKeyValue: any = await mySqlMaster.getEnvKey('MASTER_KEY');
    let jwtKey: string = jwtKeyValue ? (jwtKeyValue + '').trim() : '';
    let tokenExceptionPaths = [...BypassAuth];
    let skipJwtToken = false;
    let keyUTCDateMySql: string = '';
    let message: string = '';
    let userID: string = '';
    try {

        authorizationKey = req.headers['authorization'] + ''; // Express headers are auto converted to lowercase
        token = req.headers['token'] + ''; // Express headers are auto converted to lowercase
        //Skip on Status
        if (req.path === '/status' || req.path === '/vipnumberworld/status') {
            next();
            return;
        }
        //validating token

        if (authorizationKey == '') {
            throw 'AUTH ERROR: Authentication Key: BLANK';
        } else if (authorizationKey == 'undefined') {
            throw 'AUTH ERROR: Authentication Key: UNDEFINED';
        } else if (!authorizationKey) {
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
            throw 'AUTH ERROR: Authentication Key: INVALID or EXPIRED'
        } else {
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

        if (skipJwtToken) {  // Check for exception path flag
            //logger message
            message = message + ': tokenExceptionPaths, TOKEN NOT REQUIRED';
            //going to next step
            next();
        } else {  // JWT TOKEN Validation
            // reading JWT KEY from env file
            // jwtKey = process.env.MASTER_KEY + '';
            jwtKey = jwtKey.trim();
            if (jwtKey == '') {
                message = message + ':AUTH ERROR: TOKEN KEY: BLANK: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: BLANK';
            } else if (jwtKey == 'undefined') {
                message = message + ':AUTH ERROR: TOKEN KEY: UNDEFINED: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: UNDEFINED';
            } else if (!jwtKey) {
                message = message + ':AUTH ERROR: TOKEN KEY: NA: JWT=FAIL';
                throw 'AUTH ERROR: TOKEN KEY: NA';
            }

            //validating token
            if (token == '') {
                throw 'AUTH ERROR: TOKEN: BLANK';
            } else if (token == 'undefined') {
                throw 'AUTH ERROR: TOKEN: UNDEFINED';
            } else if (!token) {
                throw 'AUTH ERROR: TOKEN: NA';
            }

            // verifying the JST token (throws on invalid/expired -> caught -> 401)
            let tokenPayload = await jwt.getJwtPayload(token);

            // Bind the authenticated identity to the request. Downstream handlers
            // MUST use req.authUserId rather than any client-supplied user_id.
            userID = tokenPayload.userID;
            (req as any).authUserId = Number(userID) || 0;

            let resToken = await jwt.getJwtToken({ userID: userID, dt: new Date() });
            res.setHeader("token", resToken);

            //logger message
            message = message + ': JWT=SUCCESS';
            //going to next step
            next();
        }

        message = message + ': AUTH=SUCCESS (authorizationKey: ' + authorizationKey + ': token: ' + token + ': keyUTCDateMySql: ' + keyUTCDateMySql + ')';
    } catch (error) {
        message = message + ': AUTH=FAIL (authorizationKey: ' + authorizationKey + ': token: ' + token + ': keyUTCDateMySql: ' + keyUTCDateMySql + ')';
        model.status = gtUtil.Constants.AUTH_ERROR;
        model.info = JSON.stringify(error);
        return res.status(gtUtil.Constants.HTTP_UNAUTHORIZED).json(model);
    } finally {
        try {
            logger.log('userID=' + userID + ':: message=' + message + ':: req=' + JSON.stringify(masterModel.getRequestModel(req)) + ':: resModel=' + JSON.stringify(model));
        } catch (error) {
            logger.log('catch: auth logging:: ' + error + ':: ' + JSON.stringify(error) + ':: ' + JSON.stringify(model));
        }
    }
});