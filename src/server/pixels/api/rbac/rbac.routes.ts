import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Rbac } from './rbac';

const masterModel = new MasterModel();
const rbac = new Rbac();
const router = Router();

/** Admin-guarded handler: binds the verified admin id as payload.user_id. */
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

// Any authenticated user can read their own effective permissions.
router.post('/me', async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const id = gtUtil.getAuthUserId(req);
        resModel = await rbac.myPermissions({ user_id: id });
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});

// Admin: permission catalog + per-user permission mapping.
router.post('/catalog', adminHandle((p) => rbac.catalog(p)));
router.post('/user/get', adminHandle((p) => rbac.getUserPermissions(p)));
router.post('/user/set', adminHandle((p) => rbac.setUserPermissions({ target_id: p.target_id, permissions: p.permissions, granted_by: p.user_id })));

export default router;
