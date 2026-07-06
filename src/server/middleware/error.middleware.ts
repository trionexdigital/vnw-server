import express, { Request, Response, NextFunction, Router } from "express";
import { clientError, notFoundError, serverError } from "../pixels-utility/httpErrors";
import * as gtUtil from "../pixels-utility/Logger"

export const router = express.Router();
const logger = new gtUtil.Logger();

logger.log("## ERROR Handler Middleware Configuration : Start");

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  notFoundError(err, res, next);
});

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  clientError(err, res, next);
});

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  serverError(err, res, next);
});

logger.log("## ERROR Handler Middleware Configuration : Success");