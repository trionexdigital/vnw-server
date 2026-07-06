import express from "express";
import parser from "body-parser";
import compression from "compression";
import * as gtUtil from "../pixels-utility";


export const router = express.Router();
const logger = new gtUtil.Logger();

logger.log("## Common Middleware Configuration : Start");

// A05: cap request body size to mitigate memory-exhaustion DoS. 15mb comfortably
// covers base64 screenshots/avatars (~11mb) without allowing huge payloads.
router.use(parser.urlencoded({ extended: true, limit: '15mb' }));
router.use(parser.json({ limit: '15mb' }));
router.use(compression());

logger.log("## Common Middleware Configuration : Success");
