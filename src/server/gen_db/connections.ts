import { createPool } from 'mysql2/promise';

export type ConnectionName = 'pixels';

export const connections = {
  pixels: createPool({
    host: process.env.MYSQL_DB_HOST_IP,
    port: Number(process.env.MYSQL_DB_PORT),
    user: process.env.MYSQL_DB_USER,
    password: process.env.MYSQL_DB_PASSWORD,
    database: process.env.MYSQL_DB_NAME,
    waitForConnections: true,
    dateStrings: true,
    connectionLimit: Number(process.env.MYSQL_DB_CONN_COUNT),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 30000,
  }),
};