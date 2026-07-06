import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Sell } from './sell';

const masterModel = new MasterModel();
const sell = new Sell();
const router = Router();

/** Permission-guarded handler: binds the verified user id as payload.user_id. */
const permHandle = (perm: string, fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requirePermission(req, perm);
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

const adminHandle = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
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

// USER (customer) — requires the 'user.sell' permission.
router.post('/create', permHandle('user.sell', (p) => sell.create(p)));
router.post('/mine', permHandle('user.sell', (p) => sell.mine(p)));
router.post('/cancel', permHandle('user.sell', (p) => sell.cancel(p)));

// ADMIN — review queue.
router.post('/list', adminHandle((p) => sell.list(p)));
router.post('/approve', adminHandle((p) => sell.approve(p)));
router.post('/reject', adminHandle((p) => sell.reject(p)));

export default router;
