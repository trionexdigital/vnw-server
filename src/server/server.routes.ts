import express from "express";
import vnwRoutes from "./pixels/pixels.routes";

export const ServerRouter = express.Router();
const fileUpload = require('express-fileupload');
const fileSize = 200 * 1024 * 1024;

ServerRouter.use(fileUpload({
    limits: { fileSize },
    useTempFiles: false,
    tempFileDir: 'data/GT'
}));

// Lightweight health check
ServerRouter.get('/status', (_req, res) => res.status(200).json({ status: 1, info: 'VIP Number World API up', ts: new Date() }));

ServerRouter.use('/vipnumberworld', vnwRoutes);
