import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Numbers } from './numbers';

const masterModel = new MasterModel();
const numbers = new Numbers();
const router = Router();

// Public handler — no auth scoping.
const pub = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = await fn(req.body || {});
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
};

router.post('/list', pub((p) => numbers.list(p)));
router.post('/featured', pub((p) => numbers.featured(p)));
router.post('/detail', pub((p) => numbers.detail(p)));

export default router;
