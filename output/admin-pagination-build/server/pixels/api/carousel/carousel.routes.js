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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const MasterModel_1 = require("../../../models/MasterModel");
const gtUtil = __importStar(require("../../../pixels-utility"));
const carousel_1 = require("./carousel");
const router = (0, express_1.Router)();
const studio = new carousel_1.CarouselStudio();
const masterModel = new MasterModel_1.MasterModel();
router.post('/list', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield studio.publicList();
    res.status(gtUtil.Constants.HTTP_OK).json(response);
}));
function binary(req, res, previewOnly) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const asset = yield studio.getAsset(Number(req.params.id), true, previewOnly);
            if (!asset)
                return res.status(404).end();
            const etag = `\"${asset.content_sha256}\"`;
            if (req.headers['if-none-match'] === etag)
                return res.status(304).end();
            res.setHeader('Content-Type', asset.mime_type);
            res.setHeader('Content-Length', String(asset.byte_size));
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('ETag', etag);
            return res.status(200).send(asset.content);
        }
        catch (_a) {
            return res.status(404).end();
        }
    });
}
router.get('/asset/:id', (req, res) => { void binary(req, res, false); });
router.get('/preview/:id', (req, res) => { void binary(req, res, true); });
exports.default = router;
//# sourceMappingURL=carousel.routes.js.map