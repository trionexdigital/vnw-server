import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Payments } from './payments';

const masterModel = new MasterModel();
const payments = new Payments();
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

router.post('/cashfree/create-order', handle((p) => payments.createCashfreeOrder(p)));
router.post('/cashfree/verify', handle((p) => payments.verify(p)));

// Public webhook (verified via signature header, not JWT).
router.post('/cashfree/webhook', async (req: Request, res: Response) => {
    let resModel = masterModel.getResponseModel();
    try {
        const signature = req.get('x-webhook-signature') || '';
        const rawBody = (req as any).rawBody || '';
        const result = await payments.webhook(rawBody, signature, req.get('x-webhook-timestamp') || '');
        res.status(result.httpStatus).json({ status: result.status, info: result.info });
        return;
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'Webhook processing delayed.';
    } finally {
        if (!res.headersSent) res.status(503).json(resModel);
    }
});

export default router;
