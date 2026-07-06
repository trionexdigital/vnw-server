import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Dashboard } from './dashboard';

const masterModel = new MasterModel();
const dashboard = new Dashboard();
const router = Router();

router.post('/summary', async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = gtUtil.getAuthUserId(req);
        resModel = await dashboard.summary(payload);
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});

export default router;
