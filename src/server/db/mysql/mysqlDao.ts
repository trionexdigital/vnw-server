import { MasterModel } from "../../models/MasterModel";
import { Constants } from "../../pixels-utility/constant";
import { Logger } from "../../pixels-utility/Logger";
import * as mysql from "mysql2";
import dotenv from "dotenv";
import * as util from "util";
import {
  CATEGORY_CATALOG,
  CATEGORY_CLASSIFIER_VERSION,
  classifyNumber,
  syncNumberCategories,
} from "../../pixels/api/categories/categoryClassifier";

const logger = new Logger();
const masterModel = new MasterModel();
dotenv.config();

let db_host_ip: string = process.env.MYSQL_DB_HOST_IP + '';
let db_port: number = Number(process.env.MYSQL_DB_PORT + '');
let db_name: string = process.env.MYSQL_DB_NAME + '';
let db_user: string = process.env.MYSQL_DB_USER + '';
let db_password: string = process.env.MYSQL_DB_PASSWORD + '';
let db_conn_count: number = Number(process.env.MYSQL_DB_CONN_COUNT + '');

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

export function checkConnection(): Promise<boolean> {
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
        if (endError) console.error('❌ MySQL connection cleanup failed:', endError.message);
        resolve(!endError);
      });
    });
  });
}

//create mysql connection pool
logger.log('** DB Connection Pool: Starting: ' + JSON.stringify({ ...dbConnectionInfo, password: db_password ? '***REDACTED***' : '' }));
export const connPool = mysql.createPool(dbConnectionInfo);
logger.log('** DB Connection Pool: Success');

/** Explicit deployment backfill; never invoked during server startup. */
export async function reconcileAutomaticNumberCategories(pool: any = connPool.promise()): Promise<number> {
  const [exclusive]: any = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_categories'
       AND COLUMN_NAME = 'number_id' AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'`,
  );
  if (exclusive.length) throw new Error('Run the internal-category SQLyog migration first: the exclusive category index is still present.');
  const [subTable]: any = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_subcategories'`,
  );
  if (!subTable.length) throw new Error('Run the internal-category SQLyog migration first: vip_number_subcategories is missing.');

  // Validate the complete inventory before rewriting any derived membership.
  const seen = new Map<string, number>();
  const invalidIds: number[] = [];
  const duplicateIds: number[] = [];
  let preflightId = 0;
  while (true) {
    const [rows]: any = await pool.query(
      `SELECT number_id, number_value FROM vip_numbers WHERE number_id > ? ORDER BY number_id LIMIT 100`,
      [preflightId],
    );
    if (!rows.length) break;
    for (const row of rows) {
      try {
        const canonical = classifyNumber(row.number_value).canonicalNumber;
        const priorId = seen.get(canonical);
        if (priorId !== undefined) duplicateIds.push(priorId, Number(row.number_id));
        else seen.set(canonical, Number(row.number_id));
      } catch { invalidIds.push(Number(row.number_id)); }
    }
    preflightId = Number(rows[rows.length - 1].number_id);
  }
  if (invalidIds.length || duplicateIds.length) {
    throw new Error(`Category backfill blocked: invalid vip_numbers IDs: ${invalidIds.join(', ') || 'none'}; duplicate canonical vip_numbers IDs: ${[...new Set(duplicateIds)].join(', ') || 'none'}`);
  }

  let lastId = 0;
  let count = 0;
  while (true) {
    const [rows]: any = await pool.query(
      `SELECT number_id, number_value FROM vip_numbers WHERE number_id > ? ORDER BY number_id LIMIT 100`,
      [lastId],
    );
    if (!rows.length) break;
    // Validate a complete batch before changing its existing memberships.
    for (const row of rows) classifyNumber(row.number_value);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const row of rows) await syncNumberCategories(connection, Number(row.number_id), row.number_value);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    count += rows.length;
    lastId = Number(rows[rows.length - 1].number_id);
  }
  const [[staleParents]]: any = await pool.query(
    'SELECT COUNT(*) AS total FROM vip_number_categories WHERE classifier_version <> ?',
    [CATEGORY_CLASSIFIER_VERSION],
  );
  const [[staleChildren]]: any = await pool.query(
    'SELECT COUNT(*) AS total FROM vip_number_subcategories WHERE classifier_version <> ?',
    [CATEGORY_CLASSIFIER_VERSION],
  );
  const taxonomySql = CATEGORY_CATALOG.map(() => 'SELECT ? AS category_id, ? AS slug').join(' UNION ALL ');
  const taxonomyParams = CATEGORY_CATALOG.flatMap(category => [category.id, category.slug]);
  const [[orphanChildren]]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM vip_number_subcategories child
     LEFT JOIN (${taxonomySql}) taxonomy ON taxonomy.category_id = child.category_id
     LEFT JOIN vip_number_categories parent
       ON parent.number_id = child.number_id AND parent.category_slug = taxonomy.slug
      AND parent.classifier_version = ?
     WHERE child.classifier_version = ? AND (taxonomy.category_id IS NULL OR parent.number_id IS NULL)`,
    [...taxonomyParams, CATEGORY_CLASSIFIER_VERSION, CATEGORY_CLASSIFIER_VERSION],
  );
  if (Number(staleParents.total) || Number(staleChildren.total) || Number(orphanChildren.total)) {
    throw new Error(`Category backfill verification failed: stale parents ${staleParents.total}, stale children ${staleChildren.total}, children without parents ${orphanChildren.total}.`);
  }
  logger.log(`** internal-category classifier v${CATEGORY_CLASSIFIER_VERSION}: rebuilt ${count} number(s).`);
  return count;
}

export class MySqlMaster {

  autoCommit = true;

  //query result
  executeQuery(query: string) {
    let promise;
    let startMS = new Date().getTime();
    let queryModel = masterModel.getQueryModel();
    try {

      promise = new Promise((resolve, reject) => {
        connPool.query(query, async (err, results: any, fields) => {

          // in case of errror in executing the query rejecting the request
          if (err) {
            //throw new Error('Error in Query Execution: ' + err);
            queryModel.status = Constants.DB_QUERY_ERROR;
            queryModel.info = 'DB: executeQuery(): ERROR: ' + JSON.stringify(err);
            //reject(model);

          } else {
            //SUCCESS
            queryModel.status = Constants.SUCCESS;
            queryModel.info = 'SUCCESS';
            // check for select query results i.e JSON ARRAY of selected Rows
            if (util.isArray(results)) {
              queryModel.fetchedRows = results.length;
              queryModel.rows = results;
              queryModel.info = queryModel.info + ': 1, fetchedRows: ' + queryModel.fetchedRows;
            } else if ((results)) {
              queryModel.affectedRows = results.affectedRows;
              queryModel.changedRows = results.changedRows;
              queryModel.fieldCount = results.fieldCount;
              queryModel.insertId = results.insertId;
              queryModel.message = results.message;
              queryModel.protocol41 = results.protocol41;
              queryModel.serverStatus = results.serverStatus;
              queryModel.warningCount = results.warningCount;
            }

          }// end else

          // finally resolving the request
          queryModel.tat = (new Date().getTime() - startMS) / 1000;
          // logger.log('results: ' + JSON.stringify(results));
          resolve(queryModel);
        });// close conn pool

      });// close promise

      return promise;
    } catch (error) {
      throw new Error('executeQuery: ' + error);
    } finally {
      try { queryModel.endDT = new Date(); } catch (error) { }
      try { queryModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
    }
  };

  async getEnvKey(payload: string) {
    let query = "select * from `env` where key_id = '" + payload.replace(/'/g, "''") + "'";
    let queryModel: any;
    try {

      queryModel = await this.executeQuery(query);

      if (queryModel.rows && queryModel.rows.length === 1) {
        let temp = (queryModel.rows[0].value);
        return temp;
      } else {
        logger.log('WARNING: getEnvKey() - Key not found in env table: ' + payload);
        return undefined;
      }


    } catch (error) {
      logger.log('ERROR: getEnvKey() - ' + error);
      throw new Error('getEnvKey error :: ' + error)
    }
  }
}
