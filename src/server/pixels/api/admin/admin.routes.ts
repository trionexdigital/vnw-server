import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Admin } from './admin';

const masterModel = new MasterModel();
const admin = new Admin();
const router = Router();

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

// Categories
router.post('/categories/list', handle((p) => admin.categories.list({ all: true })));
router.post('/categories/save', handle((p) => admin.categories.save(p)));
router.post('/categories/delete', handle((p) => admin.categories.remove(p)));

// Orders
router.post('/orders/list', handle((p) => admin.ordersList(p)));
router.post('/orders/detail', handle((p) => admin.orderDetail(p)));
router.post('/orders/update-status', handle((p) => admin.orderUpdateStatus(p)));

// Users
router.post('/users/list', handle((p) => admin.usersList(p)));
router.post('/users/set-role', handle((p) => admin.userSetRole(p)));
router.post('/users/set-status', handle((p) => admin.userSetStatus(p)));

// Dealers
router.post('/dealers/list', handle((p) => admin.dealersList(p)));
router.post('/dealers/kyc', handle((p) => admin.dealerKyc(p)));

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

// Banners
router.post('/banners/list', handle((p) => admin.banners.list({ all: true })));
router.post('/banners/save', handle((p) => admin.banners.save(p)));
router.post('/banners/delete', handle((p) => admin.banners.remove(p)));

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
