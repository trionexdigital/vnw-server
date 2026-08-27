import { MasterModel } from "../../models/MasterModel";
import { Constants } from "../../pixels-utility/constant";
import { Logger } from "../../pixels-utility/Logger";
import * as mysql from "mysql2";
import dotenv from "dotenv";
import * as util from "util";
import {
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

/** Database schemas are managed explicitly in database/schema; startup never mutates stored data. */
interface NumberToClassify {
  number_id: number;
  number_value: string;
}

const CATEGORY_BACKFILL_BATCH_SIZE = 200;

async function scanNumbersForCategoryMigration(
  pool: any,
  onlyMissingCurrentVersion: boolean,
  visit: (rows: NumberToClassify[]) => Promise<void>,
): Promise<number> {
  let lastNumberId = 0;
  let visited = 0;
  while (true) {
    const missingSql = onlyMissingCurrentVersion
      ? `AND (
           CHAR_LENGTH(n.number_value) <> 10 OR n.number_value REGEXP '[^0-9]' OR
           (SELECT COUNT(*) FROM vip_number_categories all_vnc WHERE all_vnc.number_id = n.number_id) <> 1 OR
           NOT EXISTS (
             SELECT 1 FROM vip_number_categories vnc
             WHERE vnc.number_id = n.number_id AND vnc.classifier_version = ?
           )
         )`
      : '';
    const params = onlyMissingCurrentVersion
      ? [lastNumberId, CATEGORY_CLASSIFIER_VERSION]
      : [lastNumberId];
    const [rows]: any = await pool.query(
      `SELECT n.number_id, n.number_value
       FROM vip_numbers n
       WHERE n.number_id > ? ${missingSql}
       ORDER BY n.number_id ASC
       LIMIT ${CATEGORY_BACKFILL_BATCH_SIZE}`,
      params,
    );
    const batch = (Array.isArray(rows) ? rows : []) as NumberToClassify[];
    if (!batch.length) break;
    await visit(batch);
    visited += batch.length;
    lastNumberId = Number(batch[batch.length - 1].number_id);
  }
  return visited;
}

/**
 * Build/rebuild the versioned automatic category index. Exported so deployment
 * checks can invoke the same idempotent migration without starting HTTP.
 */
export async function reconcileAutomaticNumberCategories(pool: any = connPool.promise()): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS `schema_migrations` (" +
    "`migration_key` varchar(128) NOT NULL," +
    "`classifier_version` smallint unsigned DEFAULT NULL," +
    "`details` text," +
    "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "PRIMARY KEY (`migration_key`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS `vip_number_categories` (" +
    "`number_id` int unsigned NOT NULL," +
    "`category_slug` varchar(64) NOT NULL," +
    "`classifier_version` smallint unsigned NOT NULL," +
    "`matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "PRIMARY KEY (`number_id`,`category_slug`)," +
    "KEY `category_lookup` (`category_slug`,`number_id`)," +
    "KEY `classifier_version` (`classifier_version`)," +
    "CONSTRAINT `fk_vip_number_categories_number` FOREIGN KEY (`number_id`) " +
    "REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  );

  const migrationKey = `automatic-number-categories-v${CATEGORY_CLASSIFIER_VERSION}`;
  const [migrationRows]: any = await pool.query(
    'SELECT migration_key FROM schema_migrations WHERE migration_key = ? LIMIT 1',
    [migrationKey],
  );
  const firstRunForVersion = !Array.isArray(migrationRows) || migrationRows.length === 0;

  // Always preflight the complete inventory before changing anything. This
  // catches invalid legacy rows and differently formatted duplicates even
  // during a rolling deployment with older writers still present.
  const invalidIds: number[] = [];
  const idsByCanonicalNumber = new Map<string, number[]>();
  await scanNumbersForCategoryMigration(pool, false, async (rows) => {
    for (const row of rows) {
      try {
        const canonical = classifyNumber(row.number_value).canonicalNumber;
        const ids = idsByCanonicalNumber.get(canonical) || [];
        ids.push(Number(row.number_id));
        idsByCanonicalNumber.set(canonical, ids);
      }
      catch { invalidIds.push(Number(row.number_id)); }
    }
  });
  const duplicateIds = [...idsByCanonicalNumber.values()]
    .filter((ids) => ids.length > 1)
    .flat()
    .sort((left, right) => left - right);
  if (invalidIds.length || duplicateIds.length) {
    const describeIds = (ids: number[]) => {
      const shown = ids.slice(0, 100).join(', ');
      return shown + (ids.length > 100 ? ` (+${ids.length - 100} more)` : '');
    };
    const issues = [
      ...(invalidIds.length ? [`invalid vip_numbers IDs: ${describeIds(invalidIds)}`] : []),
      ...(duplicateIds.length ? [`duplicate canonical vip_numbers IDs: ${describeIds(duplicateIds)}`] : []),
    ];
    throw new Error(`Automatic category migration blocked by ${issues.join('; ')}`);
  }

  let canonicalized = 0;
  const migrated = await scanNumbersForCategoryMigration(pool, !firstRunForVersion, async (rows) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const row of rows) {
        const classification = classifyNumber(row.number_value);
        if (classification.canonicalNumber !== String(row.number_value)) {
          await connection.query(
            'UPDATE vip_numbers SET number_value = ? WHERE number_id = ?',
            [classification.canonicalNumber, Number(row.number_id)],
          );
          canonicalized += 1;
        }
        await syncNumberCategories(connection, Number(row.number_id), classification.canonicalNumber);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

  // An exclusive classifier must leave one and only one current mapping for
  // every inventory record. Fail before adding the database constraint so a
  // concurrent v1 writer cannot be hidden by a partially successful rollout.
  const [invalidMappingRows]: any = await pool.query(
    `SELECT n.number_id,
            COUNT(vnc.number_id) AS mapping_count,
            COALESCE(SUM(vnc.classifier_version = ?), 0) AS current_mapping_count
     FROM vip_numbers n
     LEFT JOIN vip_number_categories vnc ON vnc.number_id = n.number_id
     GROUP BY n.number_id
     HAVING mapping_count <> 1 OR current_mapping_count <> 1
     ORDER BY n.number_id ASC
     LIMIT 100`,
    [CATEGORY_CLASSIFIER_VERSION],
  );
  if (Array.isArray(invalidMappingRows) && invalidMappingRows.length > 0) {
    const ids = invalidMappingRows.map((row: any) => Number(row.number_id)).join(', ');
    throw new Error(`Automatic category migration did not produce exactly one v${CATEGORY_CLASSIFIER_VERSION} mapping for vip_numbers IDs: ${ids}. Drain older server processes and retry.`);
  }

  const [uniqueIndexRows]: any = await pool.query(
    `SELECT s.INDEX_NAME
     FROM information_schema.STATISTICS s
     WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'vip_number_categories'
       AND s.NON_UNIQUE = 0
     GROUP BY s.INDEX_NAME
     HAVING COUNT(*) = 1
        AND MAX(CASE WHEN s.COLUMN_NAME = 'number_id' THEN 1 ELSE 0 END) = 1`,
  );
  if (!Array.isArray(uniqueIndexRows) || uniqueIndexRows.length === 0) {
    await pool.query(
      'ALTER TABLE vip_number_categories ADD UNIQUE KEY number_category_exclusive (number_id)',
    );
  }

  // Historical category CRUD requests can no longer be replayed. REJECTED is
  // the current approval enum's safe terminal state.
  const retirementNote = 'Category Master retired; categories are now detected automatically.';
  await pool.query(
    `UPDATE approval_requests
     SET status = 'REJECTED', review_note = ?, result = ?, reviewed_at = NOW()
     WHERE status = 'PENDING' AND action_key IN ('categories.save', 'categories.delete')`,
    [retirementNote, JSON.stringify({ retired: true, classifier_version: CATEGORY_CLASSIFIER_VERSION })],
  );

  await pool.query(
    `INSERT INTO schema_migrations (migration_key, classifier_version, details)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE classifier_version = VALUES(classifier_version), details = VALUES(details)`,
    [migrationKey, CATEGORY_CLASSIFIER_VERSION, JSON.stringify({ migrated_numbers: migrated, canonicalized_numbers: canonicalized })],
  );
  logger.log(`** automatic-category migration v${CATEGORY_CLASSIFIER_VERSION}: classified ${migrated}, canonicalized ${canonicalized} number(s).`);
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
