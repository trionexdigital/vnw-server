import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Wishlist } from './wishlist';

const masterModel = new MasterModel();
const wishlist = new Wishlist();
const router = Router();

const handle = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = gtUtil.getAuthUserId(req);
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

router.post('/list', handle((p) => wishlist.list(p)));
router.post('/add', handle((p) => wishlist.add(p)));
router.post('/remove', handle((p) => wishlist.remove(p)));

export default router;
