import { Logger } from "./Logger";
import { CryptoJS } from './cryptoJS';

export class Methods {
    logger = new Logger();
    crypto = new CryptoJS();
   

    formatDatetime(date: Date, format: string) {
        const _padStart = (value: number): string => value.toString().padStart(2, '0');
        try {

            if (isNaN(date.getTime())) {
                throw new Error("Invalid Date provided");
            }

            return format
                .replace(/yyyy/g, _padStart(date.getFullYear()))
                .replace(/dd/g, _padStart(date.getDate()))
                .replace(/mm/g, _padStart(date.getMonth() + 1))
                .replace(/hh/g, _padStart(date.getHours()))
                .replace(/mi/g, _padStart(date.getMinutes()))
                .replace(/ss/g, _padStart(date.getSeconds()))
                .replace(/ms/g, _padStart(date.getMilliseconds()));
        } catch (error) {
            throw new Error("formatDatetime : " + JSON.stringify(error));
        }
    }

    formatUTCDatetime(date: Date, format: string) {
        const _padStart = (value: number): string => value.toString().padStart(2, '0');
        try {

            if (isNaN(date.getTime())) {
                throw new Error("Invalid Date provided");
            }

            return format
                .replace(/yyyy/g, _padStart(date.getUTCFullYear()))
                .replace(/dd/g, _padStart(date.getUTCDate()))
                .replace(/mm/g, _padStart(date.getUTCMonth() + 1))
                .replace(/hh/g, _padStart(date.getUTCHours()))
                .replace(/mi/g, _padStart(date.getUTCMinutes()))
                .replace(/ss/g, _padStart(date.getUTCSeconds()))
                .replace(/ms/g, _padStart(date.getUTCMilliseconds()));
        } catch (error) {
            throw new Error("formatUTCDatetime : " + JSON.stringify(error));
        }
    }

    getDateTimeStamp() {
        try {
            // today = yyyy + '' + mm + '' + dd + '' + hh + '' + min + '' + ss;
            return this.formatDatetime(new Date(), "yyyymmddhhmiss");
        } catch (error) {
            throw error;
        }
    }

    getDateMySQL() {
        try {

            // today = yyyy + '-' + mm + '-' + dd;
            return this.formatDatetime(new Date(), "yyyy-mm-dd");
        } catch (error) {
            throw error;
        }
    }

    getDate() {
        try {
            //today = yyyy + '' + mm + '' + dd
            return this.formatDatetime(new Date(), "yyyymmdd");
        } catch (error) {
            throw error;
        }
    }

    getDTS() {
        try {
            //today = (yyyy + '' + mm + '' + dd + '' + hh + '' + min + '' + ss + '.' + ms);
            return this.formatDatetime(new Date(), "yyyymmddhhmiss.ms");
        } catch (error) {
            throw error;
        }
    }

    getUTCDateTimeStamp() {
        try {
            // today = yyyy + '' + mm + '' + dd + '' + hh + '' + min + '' + ss;
            return this.formatUTCDatetime(new Date(), "yyyymmddhhmiss");
        } catch (error) {
            throw error;
        }
    }


    getUTCDateMySQL() {
        try {

            // today = yyyy + '-' + mm + '-' + dd;
            return this.formatUTCDatetime(new Date(), 'yyyy-mm-dd')

        } catch (error) {
            throw error;
        }
    }

    getUTCDate() {
        try {
            //today = yyyy + '' + mm + '' + dd
            return this.formatUTCDatetime(new Date(), "yyyymmdd");
        } catch (error) {
            throw error;
        }
    }

    getUTCDTS() {
        try {
            //today = (yyyy + '' + mm + '' + dd + '' + hh + '' + min + '' + ss + '.' + ms);
            return this.formatUTCDatetime(new Date(), "yyyymmddhhmiss.ms");
        } catch (error) {
            throw error;
        }
    }

    getAuthKey() {
        let utcDate;
        let authKey = '';
        try {
            // today = yyyy + '-' + mm + '-' + dd;
            utcDate = this.formatUTCDatetime(new Date(), 'yyyy-mm-dd');
            authKey = this.crypto.MD5(utcDate);
            return authKey;
        } catch (error) {
            throw error;
        }
    }

}