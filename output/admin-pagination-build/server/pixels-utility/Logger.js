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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const fs = __importStar(require("fs"));
dotenv_1.default.config();
class Logger {
    constructor() {
        // const fs = require('fs');
        this.fileLog = true;
    }
    writeLog(message, logType) {
        const currentDate = new Date();
        const yyyy = currentDate.getFullYear();
        let mm = (currentDate.getMonth() + 1) + '';
        let dd = currentDate.getDate() + '';
        let hh = currentDate.getHours() + '';
        let min = currentDate.getMinutes() + '';
        let ss = currentDate.getSeconds() + '';
        let ms = currentDate.getMilliseconds() + '';
        let today;
        let logFileName = '';
        try {
            //check for file log
            try {
                let tmp = process.env.FILE_LOG + '';
                tmp = tmp.toUpperCase().trim();
                if (tmp == 'DISABLED') {
                    this.fileLog = false;
                }
            }
            catch (error) { }
            //
            if (currentDate.getDate() < 10) {
                dd = `0${dd}`;
            }
            //
            if ((currentDate.getMonth() + 1) < 10) {
                mm = `0${mm}`;
            }
            //
            if (currentDate.getHours() < 10) {
                hh = `0${hh}`;
            }
            //
            if (currentDate.getMinutes() < 10) {
                min = `0${min}`;
            }
            //
            if (currentDate.getSeconds() < 10) {
                ss = `0${ss}`;
            }
            //
            if (currentDate.getMilliseconds() < 10) {
                ms = `00${ms}`;
            }
            if (currentDate.getMilliseconds() < 100) {
                ms = `0${ms}`;
            }
            //
            today = yyyy + '' + mm + '' + dd + ':' + hh + '' + min + '' + ss + '.' + ms;
            logFileName = 'logs/' + yyyy + '' + mm + '' + dd + '.log';
            if (logType == '') {
                logType = 'INFO';
            }
            // printing log on console
            console.log(today + ': ' + logType + ': ' + message);
            if (this.fileLog) {
                //writing log in file
                try {
                    // checking for log folder
                    if (!fs.existsSync('logs/')) {
                        fs.mkdirSync('logs/');
                    }
                    let logFile = fs.createWriteStream(logFileName, { flags: 'a' });
                    logFile.write(today + ': ' + logType + ': ' + message + '\n\n');
                    logFile.end();
                }
                catch (error) {
                    console.log(new Date() + ': logger/writeLog: Error in Writing log to File : ' + error + ' : ' + message);
                }
            }
        }
        catch (error) {
            console.log(new Date() + ': logger/writeLog: Catch: ' + error + ' : ' + message);
        }
    }
    log(message) {
        try {
            this.writeLog(message, 'LOG');
        }
        catch (error) {
            console.log(new Date() + ': logger/log: Catch: ' + error + ': ' + message);
        }
    }
    error(message) {
        try {
            this.writeLog(message, 'ERROR');
        }
        catch (error) {
            console.log(new Date() + ': logger/error: Catch: ' + error + ': ' + message);
        }
    }
    info(message) {
        try {
            this.writeLog(message, 'INFO');
        }
        catch (error) {
            console.log(new Date() + ': logger/info: Catch: ' + error + ': ' + message);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map