import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Admin } from './admin';
import { Sell } from '../sell/sell';
import { Approvals } from '../approvals/approvals';
import { CarouselStudio } from '../carousel/carousel';
import { CATEGORY_CLASSIFIER_VERSION } from '../categories/categoryClassifier';
import { DealsOfDay } from '../dealsOfDay/dealsOfDay';
import { MarketplaceContent } from '../site/marketplaceContent';
import { Prebooks } from '../prebooks/prebooks';

const masterModel = new MasterModel();
const admin = new Admin();
const sell = new Sell();
const approvals = new Approvals();
const carousel = new CarouselStudio();
const dealsOfDay = new DealsOfDay();
const marketplace = new MarketplaceContent();
const prebooks = new Prebooks();
const router = Router();

const categoryMutationRetired = async () => {
    const response = masterModel.getResponseModel();
    response.status = -410;
    response.info = 'Category Master has been retired. Categories are detected automatically from the mobile number.';
    response.data = { retired: true, classifier_version: CATEGORY_CLASSIFIER_VERSION };
    return response;
};

// Every admin endpoint requires ADMIN role (verified against the DB).
const handle = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requireAdmin(req);
        resModel = await fn(payload);
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
};

router.post('/dashboard', handle((p) => admin.dashboard(p)));

// Numbers
router.post('/numbers/list', handle((p) => admin.numbersList(p)));
router.post('/numbers/save', handle((p) => admin.numberSave(p)));
router.post('/numbers/delete', handle((p) => admin.numberDelete(p)));
router.post('/numbers/approve', handle((p) => admin.numberApprove(p)));
router.post('/numbers/reject', handle((p) => admin.numberReject(p)));

// Deal of the Day master
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
router.post('/trusted-clients/logo/upload', async (req: Request, res: Response) => {
    let response = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requireAdmin(req);
        response = await marketplace.clientUpload(payload, (req as any).files?.file);
    } catch (error) {
        response.status = -9;
        response.info = 'catch: ' + error;
    }
    res.status(gtUtil.Constants.HTTP_OK).json(response);
});

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

router.post('/carousel/asset/upload', async (req: Request, res: Response) => {
    let response = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requireAdmin(req);
        response = await carousel.uploadAsset(payload, (req as any).files?.file);
    } catch (error) {
        response.status = -9;
        response.info = 'catch: ' + error;
    }
    res.status(gtUtil.Constants.HTTP_OK).json(response);
});

router.get('/carousel/asset/:id', async (req: Request, res: Response) => {
    try {
        await gtUtil.requireAdmin(req);
        const asset = await carousel.getAsset(Number(req.params.id), false);
        if (!asset) return res.status(404).end();
        const etag = `\"${asset.content_sha256}\"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.setHeader('Content-Type', asset.mime_type);
        res.setHeader('Content-Length', String(asset.byte_size));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('ETag', etag);
        return res.status(200).send(asset.content);
    } catch { return res.status(404).end(); }
});

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

export default router;
