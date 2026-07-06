import { connections, ConnectionName } from "./connections";
import * as gtUtil from "../pixels-utility";
import { MasterModel } from "../models/MasterModel";

export class MySqlClient {
  private conn: any;
  private name: ConnectionName;
  private masterModel = new MasterModel();

  constructor(connectionName: ConnectionName) {
    this.name = connectionName;
    this.conn = connections[connectionName];

    if (!this.conn) {
      throw new Error(`Unknown DB connection: ${connectionName}`);
    }
  }

  /**
   * Check DB connection health
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.conn.query("SELECT 1");
      console.log(`DB(${this.name}) connection OK`);
      return true;
    } catch (err: any) {
      console.error(`DB(${this.name}) FAILED: ${err.message}`);
      return false;
    }
  }

  /**
   * Generic query handler using MasterModel
   */
  async executeQuery(sql: string, params?: any[]) {
    const start = Date.now();
    const queryModel = this.masterModel.getQueryModel();

    try {
      const [result]: any = await this.conn.query(sql, params);

      queryModel.status = gtUtil.Constants.SUCCESS;
      queryModel.info = "SUCCESS";

      if (Array.isArray(result)) {
        // SELECT
        queryModel.rows = result;
        queryModel.fetchedRows = result.length;
      } else if (result) {
        // INSERT / UPDATE / DELETE
        queryModel.affectedRows = result.affectedRows;
        queryModel.changedRows = result.changedRows;
        queryModel.insertId = result.insertId;
        queryModel.message = result.message;
        queryModel.protocol41 = result.protocol41;
        queryModel.serverStatus = result.serverStatus;
        queryModel.warningCount = result.warningCount;
      }
    } catch (err: any) {
      queryModel.status = gtUtil.Constants.DB_QUERY_ERROR;
      queryModel.info = `DB ERROR: ${err.message}`;
    }

    queryModel.endDT = new Date();
    queryModel.tat = (Date.now() - start) / 1000;

    return queryModel;
  }

  /**
   * Short form returning simpler structure (optional)
   */
  async simpleQuery<T = any>(sql: string, params?: any[]) {
    try {
      const [result]: any = await this.conn.query(sql, params);
      return { status: 1, info: "SUCCESS", data: result as T };
    } catch (err: any) {
      return { status: -1, info: err.message, data: {} };
    }
  }

  /**
   * Get a single connection from the pool for transactions
   */
  async getConnection() {
    return await this.conn.getConnection();
  }
}
