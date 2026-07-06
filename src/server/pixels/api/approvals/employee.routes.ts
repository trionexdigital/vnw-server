import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Admin } from '../admin/admin';
import { Sell } from '../sell/sell';
import { Approvals } from './approvals';
import { ACTIONS } from './actions';

const masterModel = new MasterModel();
const admin = new Admin();
const sell = new Sell();
const approvals = new Approvals();
const router = Router();

/** Employee/admin-guarded handler. */
const empHandle = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requireRole(req, ['EMPLOYEE', 'ADMIN']);
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
router.post('/actions', empHandle(async () => {
    const data = Object.entries(ACTIONS).map(([key, def]) => ({ action_key: key, label: def.label }));
    return { status: 1, info: 'OK', data };
}));

// ---- Deferred-action queue: employee submits, views own submissions ----
router.post('/submit', empHandle((p) => approvals.submit({ user_id: p.user_id, action_key: p.action_key, payload: p.payload })));
router.post('/my-submissions', empHandle((p) => approvals.mine(p)));

export default router;
