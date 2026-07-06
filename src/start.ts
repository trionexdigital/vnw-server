import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import * as gtUtil from "./server/pixels-utility";
const logger = new gtUtil.Logger();
logger.log("*************  Starting App server  *************");

import http from "http";
import express from "express";
import helmet from "helmet";
import { router as CommonRouter } from "./server/middleware/common.middleware";
import { router as ErrorRouter } from "./server/middleware/error.middleware";
import { router as CorsRouter } from "./server/middleware/cors.middleware";
import { router as RateLimitRouter } from "./server/middleware/rateLimit.middleware";
import { router as AuthRouter } from "./server/middleware/auth.middleware"
import { ServerRouter } from "./server/server.routes";
import * as mysql from "./server/db/mysql/mysqlDao";


process.on("uncaughtException", e => {
  logger.log("*************  Starting App server : APP SERVER CRASHED : ERROR(uncaughtException) : " + e);
  process.exit(1);
});

process.on("unhandledRejection", e => {
  logger.log("*************  Starting App server : APP SERVER CRASHED : ERROR(unhandledRejection) : " + e);
});

//creating express app
const app = express();


// Check mySQL connection
logger.log("**Checking MySQL connection");
mysql.checkConnection();

// Reconcile DB schema (idempotent) — drops the obsolete investments.lock_in_until
// column and applies the other documented required migrations so existing
// databases keep working without manual ALTERs.
logger.log("**Reconciling MySQL schema (ensureSchema)");
mysql.ensureSchema().catch((e) => logger.log("ensureSchema error: " + e));

// securing app
logger.log("**Securing application with HELMET");
app.use(helmet());

logger.log("**Integrating COMMON Middleware of the application");
app.use(CommonRouter);

logger.log("**Integrating CORS Middleware of the application");
app.use(CorsRouter);

logger.log("**Integrating RATE-LIMIT Middleware of the application");
app.use(RateLimitRouter);

logger.log("**Integrating ERROR Middleware of the application");
app.use(ErrorRouter);

logger.log("**Integrating AUTH Middleware of the application");
app.use(AuthRouter);

logger.log("**Integrating Default/All Routes of the application");
app.use(ServerRouter);

logger.log("**Configuring listening Port of server");
const PORT = process.env.NODE_EXPRESS_PORT;

logger.log("**Creating http server ");
const server = http.createServer(app);

server.listen(PORT, () =>
  logger.log("*************  Server is running on " + JSON.stringify(server.address()) + "  *************")
);