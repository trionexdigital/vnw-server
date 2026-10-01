"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerRouter = void 0;
const express_1 = __importDefault(require("express"));
const pixels_routes_1 = __importDefault(require("./pixels/pixels.routes"));
exports.ServerRouter = express_1.default.Router();
const fileUpload = require('express-fileupload');
const fileSize = 200 * 1024 * 1024;
exports.ServerRouter.use(fileUpload({
    limits: { fileSize },
    useTempFiles: false,
    tempFileDir: 'data/GT'
}));
// Lightweight health check
exports.ServerRouter.get('/status', (_req, res) => res.status(200).json({ status: 1, info: 'VIP Number World API up', ts: new Date() }));
exports.ServerRouter.use('/vipnumberworld', pixels_routes_1.default);
//# sourceMappingURL=server.routes.js.map