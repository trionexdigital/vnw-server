import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Dealer } from './dealer';

const masterModel = new MasterModel();
const dealer = new Dealer();
const router = Router();

// Every dealer endpoint is gated by a specific dealer permission (ADMIN always
// passes). Permissions are mapped per-dealer by an admin during account creation.
const handle = (perm: string, fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
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

router.post('/dashboard', handle('dealer.dashboard', (p) => dealer.dashboard(p)));
router.post('/listings', handle('dealer.listings.view', (p) => dealer.listings(p)));
router.post('/listing/create', handle('dealer.listings.create', (p) => dealer.createListing(p)));
router.post('/listing/update', handle('dealer.listings.edit', (p) => dealer.updateListing(p)));
router.post('/listing/delete', handle('dealer.listings.delete', (p) => dealer.deleteListing(p)));
router.post('/sales', handle('dealer.sales', (p) => dealer.sales(p)));
router.post('/profile', handle('dealer.profile', (p) => dealer.getProfile(p)));
router.post('/profile/update', handle('dealer.profile', (p) => dealer.updateProfile(p)));
router.post('/payout/request', handle('dealer.payouts', (p) => dealer.requestPayout(p)));
router.post('/payouts', handle('dealer.payouts', (p) => dealer.payouts(p)));

export default router;
