import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Dealer } from './dealer';

const masterModel = new MasterModel();
const dealer = new Dealer();
const router = Router();

// Every dealer endpoint requires the DEALER (or ADMIN) role, verified against the DB.
const handle = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = await gtUtil.requireRole(req, ['DEALER', 'ADMIN']);
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

router.post('/dashboard', handle((p) => dealer.dashboard(p)));
router.post('/listings', handle((p) => dealer.listings(p)));
router.post('/listing/create', handle((p) => dealer.createListing(p)));
router.post('/listing/update', handle((p) => dealer.updateListing(p)));
router.post('/listing/delete', handle((p) => dealer.deleteListing(p)));
router.post('/sales', handle((p) => dealer.sales(p)));
router.post('/profile', handle((p) => dealer.getProfile(p)));
router.post('/profile/update', handle((p) => dealer.updateProfile(p)));
router.post('/payout/request', handle((p) => dealer.requestPayout(p)));
router.post('/payouts', handle((p) => dealer.payouts(p)));

export default router;
