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
const admin_1 = require("./admin");
const sell_1 = require("../sell/sell");
const approvals_1 = require("../approvals/approvals");
const carousel_1 = require("../carousel/carousel");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const dealsOfDay_1 = require("../dealsOfDay/dealsOfDay");
const marketplaceContent_1 = require("../site/marketplaceContent");
const prebooks_1 = require("../prebooks/prebooks");
const homePremium_1 = require("../site/homePremium");
const privateLinks_1 = require("../privateLinks/privateLinks");
const dealerPurchases_1 = require("../dealerPurchases/dealerPurchases");
const masterModel = new MasterModel_1.MasterModel();
const admin = new admin_1.Admin();
const sell = new sell_1.Sell();
const approvals = new approvals_1.Approvals();
const carousel = new carousel_1.CarouselStudio();
const dealsOfDay = new dealsOfDay_1.DealsOfDay();
const marketplace = new marketplaceContent_1.MarketplaceContent();
const prebooks = new prebooks_1.Prebooks();
const homePremium = new homePremium_1.HomePremium();
const privateLinks = new privateLinks_1.PrivateLinks();
const dealerPurchases = new dealerPurchases_1.DealerPurchases();
const router = (0, express_1.Router)();
const categoryMutationRetired = () => __awaiter(void 0, void 0, void 0, function* () {
    const response = masterModel.getResponseModel();
    response.status = -410;
    response.info = 'Category Master has been retired. Categories are detected automatically from the mobile number.';
    response.data = { retired: true, classifier_version: categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION };
    return response;
});
// Every admin endpoint requires ADMIN role (verified against the DB).
const handle = (fn) => (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = yield gtUtil.requireAdmin(req);
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
router.post('/dashboard', handle((p) => admin.dashboard(p)));
// Numbers
router.post('/numbers/list', handle((p) => admin.numbersList(p)));
router.post('/numbers/save', handle((p) => admin.numberSave(p)));
router.post('/numbers/delete', handle((p) => admin.numberDelete(p)));
router.post('/numbers/approve', handle((p) => admin.numberApprove(p)));
router.post('/numbers/reject', handle((p) => admin.numberReject(p)));
// Private Offline number collections
router.post('/private-links/list', handle(() => privateLinks.list()));
router.post('/private-links/create', handle((p) => privateLinks.create(p)));
router.post('/private-links/update', handle((p) => privateLinks.update(p)));
router.post('/private-links/rotate', handle((p) => privateLinks.rotate(p)));
router.post('/private-links/revoke', handle((p) => privateLinks.revoke(p)));
// Numbers purchased from external suppliers
router.post('/dealer-purchases/dealers/list', handle(() => dealerPurchases.dealers()));
router.post('/dealer-purchases/dealers/create', handle((p) => dealerPurchases.createDealer(p)));
router.post('/dealer-purchases/summary', handle((p) => dealerPurchases.summary(p)));
router.post('/dealer-purchases/list', handle((p) => dealerPurchases.list(p)));
router.post('/dealer-purchases/create', handle((p) => dealerPurchases.create(p)));
router.post('/dealer-purchases/mark-sold', handle((p) => dealerPurchases.markSold(p)));
router.post('/dealer-purchases/reverse-sold', handle((p) => dealerPurchases.reverseSold(p)));
router.post('/dealer-purchases/delete', handle((p) => dealerPurchases.remove(p)));
router.post('/dealer-purchases/restore', handle((p) => dealerPurchases.restore(p)));
router.post('/dealer-purchases/payments/list', handle((p) => dealerPurchases.payments(p)));
router.post('/dealer-purchases/payments/record', handle((p) => dealerPurchases.recordPayment(p)));
router.post('/dealer-purchases/payments/void', handle((p) => dealerPurchases.voidPayment(p)));
// Homepage premium number curation
router.post('/home-premium/list', handle(() => homePremium.list(true)));
router.post('/home-premium/save', handle((p) => homePremium.save(p)));
router.post('/home-premium/reorder', handle((p) => homePremium.reorder(p)));
router.post('/home-premium/remove', handle((p) => homePremium.remove(p)));
// Lucky Pick of the Day master (legacy route name retained for compatibility)
router.post('/deals-of-day/list', handle(() => dealsOfDay.adminList()));
router.post('/deals-of-day/save', handle((p) => dealsOfDay.save(p)));
router.post('/deals-of-day/reorder', handle((p) => dealsOfDay.reorder(p)));
router.post('/deals-of-day/delete', handle((p) => dealsOfDay.remove(p)));
// Categories
router.post('/categories/list', handle((p) => admin.categories.list({ all: true })));
router.post('/categories/save', handle(categoryMutationRetired));
router.post('/categories/delete', handle(categoryMutationRetired));
// Orders
router.post('/orders/list', handle((p) => admin.ordersList(p)));
router.post('/orders/detail', handle((p) => admin.orderDetail(p)));
router.post('/orders/update-status', handle((p) => admin.orderUpdateStatus(p)));
// Paid NON-RTP reservations and refund review
router.post('/prebooks/list', handle((p) => prebooks.adminList(p)));
router.post('/prebooks/fulfill', handle((p) => prebooks.fulfill(p)));
router.post('/prebooks/mark-unavailable', handle((p) => prebooks.markUnavailable(p)));
router.post('/prebook-refunds/list', handle((p) => prebooks.refundList(p)));
router.post('/prebook-refunds/approve', handle((p) => prebooks.approveRefund(p)));
router.post('/prebook-refunds/reject', handle((p) => prebooks.rejectRefund(p)));
router.post('/prebook-refunds/retry', handle((p) => prebooks.approveRefund(p)));
// Users
router.post('/users/list', handle((p) => admin.usersList(p)));
router.post('/users/set-role', handle((p) => admin.userSetRole(p)));
router.post('/users/set-status', handle((p) => admin.userSetStatus(p)));
// Dealers
router.post('/dealers/list', handle((p) => admin.dealersList(p)));
router.post('/dealers/kyc', handle((p) => admin.dealerKyc(p)));
router.post('/dealers/create', handle((p) => admin.createDealer(p)));
// Staff (employees)
router.post('/employees/create', handle((p) => admin.createEmployee(p)));
// RBAC permissions
router.post('/permissions/catalog', handle((p) => admin.rbac.catalog(p)));
router.post('/permissions/user/get', handle((p) => admin.rbac.getUserPermissions(p)));
router.post('/permissions/user/set', handle((p) => admin.rbac.setUserPermissions({ target_id: p.target_id, permissions: p.permissions, granted_by: p.user_id })));
// Sell requests (customers selling numbers to the platform)
router.post('/sell/list', handle((p) => sell.list(p)));
router.post('/sell/approve', handle((p) => sell.approve(p)));
router.post('/sell/reject', handle((p) => sell.reject(p)));
// Employee approval queue
router.post('/approvals/list', handle((p) => approvals.list(p)));
router.post('/approvals/approve', handle((p) => approvals.approve(p)));
router.post('/approvals/reject', handle((p) => approvals.reject(p)));
// Payouts
router.post('/payouts/list', handle((p) => admin.payoutsList(p)));
router.post('/payouts/update', handle((p) => admin.payoutUpdate(p)));
// Reviews
router.post('/reviews/list', handle((p) => admin.reviewsList(p)));
router.post('/reviews/moderate', handle((p) => admin.reviewModerate(p)));
// Testimonials
router.post('/testimonials/list', handle((p) => admin.testimonials.list({ all: true })));
router.post('/testimonials/save', handle((p) => admin.testimonials.save(p)));
router.post('/testimonials/delete', handle((p) => admin.testimonials.remove(p)));
// Trusted clients
router.post('/trusted-clients/list', handle(() => marketplace.clients(true)));
router.post('/trusted-clients/save', handle((p) => marketplace.clientSave(p)));
router.post('/trusted-clients/reorder', handle((p) => marketplace.clientReorder(p)));
router.post('/trusted-clients/delete', handle((p) => marketplace.clientDelete(p)));
router.post('/trusted-clients/logo/upload', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let response = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = yield gtUtil.requireAdmin(req);
        response = yield marketplace.clientUpload(payload, (_a = req.files) === null || _a === void 0 ? void 0 : _a.file);
    }
    catch (error) {
        response.status = -9;
        response.info = 'catch: ' + error;
    }
    res.status(gtUtil.Constants.HTTP_OK).json(response);
}));
// Frequently asked questions
router.post('/faqs/list', handle(() => marketplace.faqs(true)));
router.post('/faqs/save', handle((p) => marketplace.faqSave(p)));
router.post('/faqs/reorder', handle((p) => marketplace.faqReorder(p)));
router.post('/faqs/delete', handle((p) => marketplace.faqDelete(p)));
// Banners
router.post('/banners/list', handle((p) => admin.banners.list({ all: true })));
router.post('/banners/save', handle((p) => admin.banners.save(p)));
router.post('/banners/delete', handle((p) => admin.banners.remove(p)));
// Carousel Studio (separate from the legacy banners subsystem)
router.post('/carousel/list', handle(() => carousel.adminList()));
router.post('/carousel/create', handle((p) => carousel.create(p)));
router.post('/carousel/get', handle((p) => carousel.get(p)));
router.post('/carousel/draft/save', handle((p) => carousel.saveDraft(p)));
router.post('/carousel/publish', handle((p) => carousel.publish(p)));
router.post('/carousel/unpublish', handle((p) => carousel.unpublish(p)));
router.post('/carousel/duplicate', handle((p) => carousel.duplicate(p)));
router.post('/carousel/reorder', handle((p) => carousel.reorder(p)));
router.post('/carousel/delete', handle((p) => carousel.remove(p)));
router.post('/carousel/asset/delete', handle((p) => carousel.deleteAsset(p)));
router.post('/carousel/asset/upload', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let response = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = yield gtUtil.requireAdmin(req);
        response = yield carousel.uploadAsset(payload, (_a = req.files) === null || _a === void 0 ? void 0 : _a.file);
    }
    catch (error) {
        response.status = -9;
        response.info = 'catch: ' + error;
    }
    res.status(gtUtil.Constants.HTTP_OK).json(response);
}));
router.get('/carousel/asset/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield gtUtil.requireAdmin(req);
        const asset = yield carousel.getAsset(Number(req.params.id), false);
        if (!asset)
            return res.status(404).end();
        const etag = `\"${asset.content_sha256}\"`;
        if (req.headers['if-none-match'] === etag)
            return res.status(304).end();
        res.setHeader('Content-Type', asset.mime_type);
        res.setHeader('Content-Length', String(asset.byte_size));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('ETag', etag);
        return res.status(200).send(asset.content);
    }
    catch (_a) {
        return res.status(404).end();
    }
}));
// Coupons
router.post('/coupons/list', handle((p) => admin.couponsList(p)));
router.post('/coupons/save', handle((p) => admin.couponSave(p)));
router.post('/coupons/delete', handle((p) => admin.couponDelete(p)));
// Newsletter subscribers
router.post('/newsletter/list', handle((p) => admin.newsletterList(p)));
// Contact messages
router.post('/messages/list', handle((p) => admin.messagesList(p)));
// Settings
router.post('/settings/get', handle((p) => admin.settingsGet(p)));
router.post('/settings/save', handle((p) => admin.settingsSave(p)));
exports.default = router;
//# sourceMappingURL=admin.routes.js.map