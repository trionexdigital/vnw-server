import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Banners } from './banners';

const masterModel = new MasterModel();
const banners = new Banners();
const router = Router();

router.post('/list', async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = await banners.list(req.body || {});
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
