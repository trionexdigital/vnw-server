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
const site_1 = require("./site");
const dealsOfDay_1 = require("../dealsOfDay/dealsOfDay");
const marketplaceContent_1 = require("./marketplaceContent");
const homePremium_1 = require("./homePremium");
const masterModel = new MasterModel_1.MasterModel();
const site = new site_1.Site();
const dealsOfDay = new dealsOfDay_1.DealsOfDay();
const marketplace = new marketplaceContent_1.MarketplaceContent();
const homePremium = new homePremium_1.HomePremium();
const router = (0, express_1.Router)();
// All public (path is in the auth bypass list).
const pub = (fn) => (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = yield fn(req.body || {});
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error;
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});
router.post('/settings', pub((p) => site.settings()));
router.post('/hero-stats', pub((p) => site.heroStats()));
router.post('/deals-of-day', pub(() => dealsOfDay.publicList()));
router.post('/newsletter', pub((p) => site.subscribe(p)));
router.post('/enquiry', pub((p) => site.enquiry(p)));
router.post('/family-packs', pub((p) => marketplace.packs(p)));
// Backward-compatible alias for older clients and saved integrations.
router.post('/corporate-packs', pub((p) => marketplace.packs(p)));
router.post('/operators', pub(() => marketplace.operators()));
router.post('/home-premium-numbers', pub(() => homePremium.list(false)));
router.post('/trusted-clients', pub(() => marketplace.clients(false)));
router.post('/faqs', pub(() => marketplace.faqs(false)));
router.get('/trusted-clients/:id/logo', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logo = yield marketplace.clientLogo(Number(req.params.id));
        if (!(logo === null || logo === void 0 ? void 0 : logo.logo_data))
            return res.status(404).end();
        const etag = `\"${logo.logo_sha256}\"`;
        if (req.headers['if-none-match'] === etag)
            return res.status(304).end();
        res.setHeader('Content-Type', logo.logo_mime);
        res.setHeader('Content-Length', String(logo.logo_data.length));
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', etag);
        return res.status(200).send(logo.logo_data);
    }
    catch (_a) {
        return res.status(404).end();
    }
}));
exports.default = router;
//# sourceMappingURL=site.routes.js.map