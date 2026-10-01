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
const dns_1 = __importDefault(require("dns"));
dns_1.default.setDefaultResultOrder("ipv4first");
const gtUtil = __importStar(require("./server/pixels-utility"));
const logger = new gtUtil.Logger();
logger.log("*************  Starting App server  *************");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const common_middleware_1 = require("./server/middleware/common.middleware");
const error_middleware_1 = require("./server/middleware/error.middleware");
const cors_middleware_1 = require("./server/middleware/cors.middleware");
const rateLimit_middleware_1 = require("./server/middleware/rateLimit.middleware");
const auth_middleware_1 = require("./server/middleware/auth.middleware");
const server_routes_1 = require("./server/server.routes");
const mysql = __importStar(require("./server/db/mysql/mysqlDao"));
const prebooks_1 = require("./server/pixels/api/prebooks/prebooks");
process.on("uncaughtException", e => {
    logger.log("*************  Starting App server : APP SERVER CRASHED : ERROR(uncaughtException) : " + e);
    process.exit(1);
});
process.on("unhandledRejection", e => {
    logger.log("*************  Starting App server : APP SERVER CRASHED : ERROR(unhandledRejection) : " + e);
});
//creating express app
const app = (0, express_1.default)();
// Check mySQL connection
logger.log("**Checking MySQL connection");
void mysql.checkConnection();
// securing app
logger.log("**Securing application with HELMET");
app.use((0, helmet_1.default)());
logger.log("**Integrating COMMON Middleware of the application");
app.use(common_middleware_1.router);
logger.log("**Integrating CORS Middleware of the application");
app.use(cors_middleware_1.router);
logger.log("**Integrating RATE-LIMIT Middleware of the application");
app.use(rateLimit_middleware_1.router);
logger.log("**Integrating ERROR Middleware of the application");
app.use(error_middleware_1.router);
logger.log("**Integrating AUTH Middleware of the application");
app.use(auth_middleware_1.router);
logger.log("**Integrating Default/All Routes of the application");
app.use(server_routes_1.ServerRouter);
logger.log("**Configuring listening Port of server");
const PORT = process.env.NODE_EXPRESS_PORT;
logger.log("**Creating http server ");
const server = http_1.default.createServer(app);
function startServer() {
    // Database DDL and data are managed outside application startup. See
    // database/schema for the complete table-wise schema-only SQL files.
    (0, prebooks_1.startPrebookLifecycle)();
    server.listen(PORT, () => logger.log("*************  Server is running on " + JSON.stringify(server.address()) + "  *************"));
}
startServer();
//# sourceMappingURL=start.js.map