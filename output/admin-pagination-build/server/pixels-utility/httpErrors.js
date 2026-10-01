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
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverError = exports.clientError = exports.notFoundError = void 0;
const mysqlDao_1 = require("../db/mysql/mysqlDao");
const mySqlMaster = new mysqlDao_1.MySqlMaster();
class HTTPClientError extends Error {
    constructor(message) {
        if (message instanceof Object) {
            super(JSON.stringify(message));
        }
        else {
            super(message);
        }
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
class HTTP400Error extends HTTPClientError {
    constructor(message = "Bad Request") {
        super(message);
        this.statusCode = 400;
    }
}
class HTTP404Error extends HTTPClientError {
    constructor(message = "Not found") {
        super(message);
        this.statusCode = 404;
    }
}
const notFoundError = (err, res, next) => {
    throw new HTTP404Error("Method not found.");
};
exports.notFoundError = notFoundError;
const clientError = (err, res, next) => {
    if (err instanceof HTTPClientError) {
        console.warn(err);
        res.status(err.statusCode).send(err.message);
    }
    else {
        next(err);
    }
};
exports.clientError = clientError;
const serverError = (err, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let query = "SELECT * FROM `env` WHERE key_id = 'NODE_ENV'";
    let executequery = yield mySqlMaster.executeQuery(query);
    console.error(err);
    if ((executequery.rows[0].value + '').trim().toString().toLowerCase() === "production") {
        res.status(500).send("Internal Server Error");
    }
    else {
        res.status(500).send(err.stack);
    }
});
exports.serverError = serverError;
//# sourceMappingURL=httpErrors.js.map