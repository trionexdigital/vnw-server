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
exports.MySqlMaster = exports.connPool = void 0;
exports.checkConnection = checkConnection;
exports.reconcileAutomaticNumberCategories = reconcileAutomaticNumberCategories;
const MasterModel_1 = require("../../models/MasterModel");
const constant_1 = require("../../pixels-utility/constant");
const Logger_1 = require("../../pixels-utility/Logger");
const mysql = __importStar(require("mysql2"));
const dotenv_1 = __importDefault(require("dotenv"));
const util = __importStar(require("util"));
const categoryClassifier_1 = require("../../pixels/api/categories/categoryClassifier");
const logger = new Logger_1.Logger();
const masterModel = new MasterModel_1.MasterModel();
dotenv_1.default.config();
let db_host_ip = process.env.MYSQL_DB_HOST_IP + '';
let db_port = Number(process.env.MYSQL_DB_PORT + '');
let db_name = process.env.MYSQL_DB_NAME + '';
let db_user = process.env.MYSQL_DB_USER + '';
let db_password = process.env.MYSQL_DB_PASSWORD + '';
let db_conn_count = Number(process.env.MYSQL_DB_CONN_COUNT + '');
// connect to the db
const dbConnectionInfo = {
    host: db_host_ip,
    port: db_port,
    database: db_name,
    user: db_user,
    password: db_password,
    dateStrings: true,
    // multipleStatements: true,
    connectionLimit: db_conn_count //mysql connection pool length, ie DB Connections in pool
};
function checkConnection() {
    return new Promise((resolve) => {
        const connection = mysql.createConnection(dbConnectionInfo);
        connection.connect((err) => {
            if (err) {
                console.error('❌ Connection failed:', err.message);
                // A failed mysql2 connection is already closed. Calling end() here
                // queues another command and raises "connection is in closed state".
                connection.destroy();
                resolve(false);
                return;
            }
            console.log('✅ Connected successfully to MySQL database!');
            connection.end((endError) => {
                if (endError)
                    console.error('❌ MySQL connection cleanup failed:', endError.message);
                resolve(!endError);
            });
        });
    });
}
//create mysql connection pool
logger.log('** DB Connection Pool: Starting: ' + JSON.stringify(Object.assign(Object.assign({}, dbConnectionInfo), { password: db_password ? '***REDACTED***' : '' })));
exports.connPool = mysql.createPool(dbConnectionInfo);
logger.log('** DB Connection Pool: Success');
/** Explicit deployment backfill; never invoked during server startup. */
function reconcileAutomaticNumberCategories() {
    return __awaiter(this, arguments, void 0, function* (pool = exports.connPool.promise()) {
        const [exclusive] = yield pool.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_categories'
       AND COLUMN_NAME = 'number_id' AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'`);
        if (exclusive.length)
            throw new Error('Run the internal-category SQLyog migration first: the exclusive category index is still present.');
        const [subTable] = yield pool.query(`SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_subcategories'`);
        if (!subTable.length)
            throw new Error('Run the internal-category SQLyog migration first: vip_number_subcategories is missing.');
        // Validate the complete inventory before rewriting any derived membership.
        const seen = new Map();
        const invalidIds = [];
        const duplicateIds = [];
        let preflightId = 0;
        while (true) {
            const [rows] = yield pool.query(`SELECT number_id, number_value FROM vip_numbers WHERE number_id > ? ORDER BY number_id LIMIT 100`, [preflightId]);
            if (!rows.length)
                break;
            for (const row of rows) {
                try {
                    const canonical = (0, categoryClassifier_1.classifyNumber)(row.number_value).canonicalNumber;
                    const priorId = seen.get(canonical);
                    if (priorId !== undefined)
                        duplicateIds.push(priorId, Number(row.number_id));
                    else
                        seen.set(canonical, Number(row.number_id));
                }
                catch (_a) {
                    invalidIds.push(Number(row.number_id));
                }
            }
            preflightId = Number(rows[rows.length - 1].number_id);
        }
        if (invalidIds.length || duplicateIds.length) {
            throw new Error(`Category backfill blocked: invalid vip_numbers IDs: ${invalidIds.join(', ') || 'none'}; duplicate canonical vip_numbers IDs: ${[...new Set(duplicateIds)].join(', ') || 'none'}`);
        }
        let lastId = 0;
        let count = 0;
        while (true) {
            const [rows] = yield pool.query(`SELECT number_id, number_value FROM vip_numbers WHERE number_id > ? ORDER BY number_id LIMIT 100`, [lastId]);
            if (!rows.length)
                break;
            // Validate a complete batch before changing its existing memberships.
            for (const row of rows)
                (0, categoryClassifier_1.classifyNumber)(row.number_value);
            const connection = yield pool.getConnection();
            try {
                yield connection.beginTransaction();
                for (const row of rows)
                    yield (0, categoryClassifier_1.syncNumberCategories)(connection, Number(row.number_id), row.number_value);
                yield connection.commit();
            }
            catch (error) {
                yield connection.rollback();
                throw error;
            }
            finally {
                connection.release();
            }
            count += rows.length;
            lastId = Number(rows[rows.length - 1].number_id);
        }
        const [[staleParents]] = yield pool.query('SELECT COUNT(*) AS total FROM vip_number_categories WHERE classifier_version <> ?', [categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
        const [[staleChildren]] = yield pool.query('SELECT COUNT(*) AS total FROM vip_number_subcategories WHERE classifier_version <> ?', [categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
        const taxonomySql = categoryClassifier_1.CATEGORY_CATALOG.map(() => 'SELECT ? AS category_id, ? AS slug').join(' UNION ALL ');
        const taxonomyParams = categoryClassifier_1.CATEGORY_CATALOG.flatMap(category => [category.id, category.slug]);
        const [[orphanChildren]] = yield pool.query(`SELECT COUNT(*) AS total FROM vip_number_subcategories child
     LEFT JOIN (${taxonomySql}) taxonomy ON taxonomy.category_id = child.category_id
     LEFT JOIN vip_number_categories parent
       ON parent.number_id = child.number_id AND parent.category_slug = taxonomy.slug
      AND parent.classifier_version = ?
     WHERE child.classifier_version = ? AND (taxonomy.category_id IS NULL OR parent.number_id IS NULL)`, [...taxonomyParams, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
        if (Number(staleParents.total) || Number(staleChildren.total) || Number(orphanChildren.total)) {
            throw new Error(`Category backfill verification failed: stale parents ${staleParents.total}, stale children ${staleChildren.total}, children without parents ${orphanChildren.total}.`);
        }
        logger.log(`** internal-category classifier v${categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION}: rebuilt ${count} number(s).`);
        return count;
    });
}
class MySqlMaster {
    constructor() {
        this.autoCommit = true;
    }
    //query result
    executeQuery(query) {
        let promise;
        let startMS = new Date().getTime();
        let queryModel = masterModel.getQueryModel();
        try {
            promise = new Promise((resolve, reject) => {
                exports.connPool.query(query, (err, results, fields) => __awaiter(this, void 0, void 0, function* () {
                    // in case of errror in executing the query rejecting the request
                    if (err) {
                        //throw new Error('Error in Query Execution: ' + err);
                        queryModel.status = constant_1.Constants.DB_QUERY_ERROR;
                        queryModel.info = 'DB: executeQuery(): ERROR: ' + JSON.stringify(err);
                        //reject(model);
                    }
                    else {
                        //SUCCESS
                        queryModel.status = constant_1.Constants.SUCCESS;
                        queryModel.info = 'SUCCESS';
                        // check for select query results i.e JSON ARRAY of selected Rows
                        if (util.isArray(results)) {
                            queryModel.fetchedRows = results.length;
                            queryModel.rows = results;
                            queryModel.info = queryModel.info + ': 1, fetchedRows: ' + queryModel.fetchedRows;
                        }
                        else if ((results)) {
                            queryModel.affectedRows = results.affectedRows;
                            queryModel.changedRows = results.changedRows;
                            queryModel.fieldCount = results.fieldCount;
                            queryModel.insertId = results.insertId;
                            queryModel.message = results.message;
                            queryModel.protocol41 = results.protocol41;
                            queryModel.serverStatus = results.serverStatus;
                            queryModel.warningCount = results.warningCount;
                        }
                    } // end else
                    // finally resolving the request
                    queryModel.tat = (new Date().getTime() - startMS) / 1000;
                    // logger.log('results: ' + JSON.stringify(results));
                    resolve(queryModel);
                })); // close conn pool
            }); // close promise
            return promise;
        }
        catch (error) {
            throw new Error('executeQuery: ' + error);
        }
        finally {
            try {
                queryModel.endDT = new Date();
            }
            catch (error) { }
            try {
                queryModel.tat = (new Date().getTime() - startMS) / 1000;
            }
            catch (error) { }
        }
    }
    ;
    getEnvKey(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "select * from `env` where key_id = '" + payload.replace(/'/g, "''") + "'";
            let queryModel;
            try {
                queryModel = yield this.executeQuery(query);
                if (queryModel.rows && queryModel.rows.length === 1) {
                    let temp = (queryModel.rows[0].value);
                    return temp;
                }
                else {
                    logger.log('WARNING: getEnvKey() - Key not found in env table: ' + payload);
                    return undefined;
                }
            }
            catch (error) {
                logger.log('ERROR: getEnvKey() - ' + error);
                throw new Error('getEnvKey error :: ' + error);
            }
        });
    }
}
exports.MySqlMaster = MySqlMaster;
//# sourceMappingURL=mysqlDao.js.map