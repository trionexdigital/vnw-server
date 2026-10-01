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
exports.MySqlClient = void 0;
const connections_1 = require("./connections");
const constant_1 = require("../pixels-utility/constant");
const MasterModel_1 = require("../models/MasterModel");
class MySqlClient {
    constructor(connectionName) {
        this.masterModel = new MasterModel_1.MasterModel();
        this.name = connectionName;
        this.conn = connections_1.connections[connectionName];
        if (!this.conn) {
            throw new Error(`Unknown DB connection: ${connectionName}`);
        }
    }
    /**
     * Check DB connection health
     */
    checkConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.conn.query("SELECT 1");
                console.log(`DB(${this.name}) connection OK`);
                return true;
            }
            catch (err) {
                console.error(`DB(${this.name}) FAILED: ${err.message}`);
                return false;
            }
        });
    }
    /**
     * Generic query handler using MasterModel
     */
    executeQuery(sql, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const start = Date.now();
            const queryModel = this.masterModel.getQueryModel();
            try {
                const [result] = yield this.conn.query(sql, params);
                queryModel.status = constant_1.Constants.SUCCESS;
                queryModel.info = "SUCCESS";
                if (Array.isArray(result)) {
                    // SELECT
                    queryModel.rows = result;
                    queryModel.fetchedRows = result.length;
                }
                else if (result) {
                    // INSERT / UPDATE / DELETE
                    queryModel.affectedRows = result.affectedRows;
                    queryModel.changedRows = result.changedRows;
                    queryModel.insertId = result.insertId;
                    queryModel.message = result.message;
                    queryModel.protocol41 = result.protocol41;
                    queryModel.serverStatus = result.serverStatus;
                    queryModel.warningCount = result.warningCount;
                }
            }
            catch (err) {
                queryModel.status = constant_1.Constants.DB_QUERY_ERROR;
                queryModel.info = `DB ERROR: ${err.message}`;
            }
            queryModel.endDT = new Date();
            queryModel.tat = (Date.now() - start) / 1000;
            return queryModel;
        });
    }
    /**
     * Short form returning simpler structure (optional)
     */
    simpleQuery(sql, params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [result] = yield this.conn.query(sql, params);
                return { status: 1, info: "SUCCESS", data: result };
            }
            catch (err) {
                return { status: -1, info: err.message, data: {} };
            }
        });
    }
    /**
     * Get a single connection from the pool for transactions
     */
    getConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.conn.getConnection();
        });
    }
}
exports.MySqlClient = MySqlClient;
//# sourceMappingURL=database.js.map