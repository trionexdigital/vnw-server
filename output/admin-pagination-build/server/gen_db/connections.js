"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connections = void 0;
const promise_1 = require("mysql2/promise");
exports.connections = {
    pixels: (0, promise_1.createPool)({
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
//# sourceMappingURL=connections.js.map