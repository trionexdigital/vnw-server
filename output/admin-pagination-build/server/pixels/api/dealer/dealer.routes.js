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
const dealer_1 = require("./dealer");
const masterModel = new MasterModel_1.MasterModel();
const dealer = new dealer_1.Dealer();
const router = (0, express_1.Router)();
// Every dealer endpoint is gated by a specific dealer permission (ADMIN always
// passes). Permissions are mapped per-dealer by an admin during account creation.
const handle = (perm, fn) => (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = yield gtUtil.requirePermission(req, perm);
        resModel = yield fn(payload);
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});
router.post('/dashboard', handle('dealer.dashboard', (p) => dealer.dashboard(p)));
router.post('/listings', handle('dealer.listings.view', (p) => dealer.listings(p)));
router.post('/listing/create', handle('dealer.listings.create', (p) => dealer.createListing(p)));
router.post('/listing/update', handle('dealer.listings.edit', (p) => dealer.updateListing(p)));
router.post('/listing/delete', handle('dealer.listings.delete', (p) => dealer.deleteListing(p)));
router.post('/sales', handle('dealer.sales', (p) => dealer.sales(p)));
router.post('/profile', handle('dealer.profile', (p) => dealer.getProfile(p)));
router.post('/profile/update', handle('dealer.profile', (p) => dealer.updateProfile(p)));
router.post('/payout/request', handle('dealer.payouts', (p) => dealer.requestPayout(p)));
router.post('/payouts', handle('dealer.payouts', (p) => dealer.payouts(p)));
exports.default = router;
//# sourceMappingURL=dealer.routes.js.map