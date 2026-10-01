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
const admin_1 = require("../admin/admin");
const sell_1 = require("../sell/sell");
const approvals_1 = require("./approvals");
const actions_1 = require("./actions");
const masterModel = new MasterModel_1.MasterModel();
const admin = new admin_1.Admin();
const sell = new sell_1.Sell();
const approvals = new approvals_1.Approvals();
const router = (0, express_1.Router)();
/** Employee/admin-guarded handler. */
const empHandle = (fn) => (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = yield gtUtil.requireRole(req, ['EMPLOYEE', 'ADMIN']);
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
// ---- Read-only management views (safe to execute directly) ----
router.post('/dashboard', empHandle((p) => admin.dashboard(p)));
router.post('/numbers/list', empHandle((p) => admin.numbersList(p)));
router.post('/orders/list', empHandle((p) => admin.ordersList(p)));
router.post('/users/list', empHandle((p) => admin.usersList(p)));
router.post('/dealers/list', empHandle((p) => admin.dealersList(p)));
router.post('/categories/list', empHandle(() => admin.categories.list({ all: true })));
router.post('/coupons/list', empHandle((p) => admin.couponsList(p)));
router.post('/sell/list', empHandle((p) => sell.list(p)));
// ---- Catalog of actions an employee can request (for building the UI) ----
router.post('/actions', empHandle(() => __awaiter(void 0, void 0, void 0, function* () {
    const data = Object.entries(actions_1.ACTIONS).map(([key, def]) => ({ action_key: key, label: def.label }));
    return { status: 1, info: 'OK', data };
})));
// ---- Deferred-action queue: employee submits, views own submissions ----
router.post('/submit', empHandle((p) => approvals.submit({ user_id: p.user_id, action_key: p.action_key, payload: p.payload })));
router.post('/my-submissions', empHandle((p) => approvals.mine(p)));
exports.default = router;
//# sourceMappingURL=employee.routes.js.map