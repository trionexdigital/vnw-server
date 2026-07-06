import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Site } from './site';

const masterModel = new MasterModel();
const site = new Site();
const router = Router();

// All public (path is in the auth bypass list).
const pub = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = await fn(req.body || {});
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
};

router.post('/settings', pub((p) => site.settings()));
router.post('/newsletter', pub((p) => site.subscribe(p)));
router.post('/enquiry', pub((p) => site.enquiry(p)));

export default router;
