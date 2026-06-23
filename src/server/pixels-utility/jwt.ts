import { Logger } from "./Logger";
import * as jwt from "jsonwebtoken";
import { MySqlMaster } from '../db/mysql/mysqlDao';

//reading JWT key from .env file
const mySqlMaster: MySqlMaster = new MySqlMaster();

export class JWT {
    logger = new Logger();
    jwtKey = async () => {
        let key = (await mySqlMaster.getEnvKey('MASTER_KEY') + '').toString();
        return key
    };

    async getJwtToken(payLoad: any) {
        let jwtExpiresInSec = 900; //default token is valid for 15 minutes
        let token = '';

        try {
            try {
                let tmp = (await mySqlMaster.getEnvKey('JWT_TIME_OUT_SECONDS') + '').toString();
                // console.warn(jwt)
                // console.warn(this.jwtKey)
                jwtExpiresInSec = parseInt(tmp.trim(), 10);
            } catch (error) {
                this.logger.log('getJwtToken: Error in setting jwtExpiresInSec time, setting default to 15 minutes(900 sec) : ' + error);
                jwtExpiresInSec = 900;
            }

            //generating jwt toen for authentication
            token = jwt.sign(
                payLoad,
                await this.jwtKey(),
                { expiresIn: '7d' }  // this needs to be numeric value only in seconds
            );

            return token;
        } catch (error) {
            throw 'getJwtToken: ' + error;
        }
    }

   async getJwtPayload(token: string) {
        try {
            //validating token
            if (!token || token === '' || token === 'undefined' || token === 'null') {
                throw 'ERROR: INVALID JWT';
            }

            const key = await this.jwtKey();
            if (!key || key === '' || key === 'undefined') {
                throw 'ERROR: INVALID JWT KEY';
            }

            // Synchronously verify the signature + expiry. jwt.verify THROWS on
            // any invalid/expired/tampered token — which propagates to the caller
            // (the auth middleware) and results in a 401. The decoded payload
            // (containing the real userID set at login) is returned to the caller.
            const decoded: any = jwt.verify(token, key);

            if (!decoded || typeof decoded !== 'object' || !decoded.userID) {
                throw 'ERROR: JWT MISSING SUBJECT';
            }

            return decoded;
        } catch (error) {
            this.logger.error('getJwtPayload: ' + error);
            throw 'AUTH ERROR: TOKEN INVALID OR EXPIRED';
        }
    }

}