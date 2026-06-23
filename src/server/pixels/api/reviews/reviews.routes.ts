import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Reviews } from './reviews';

const masterModel = new MasterModel();
const reviews = new Reviews();
const router = Router();

// Public: list reviews for a number.
router.post('/by-number', async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = await reviews.byNumber(req.body || {});
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});

// Authenticated: submit a review.
router.post('/create', async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body || {};
        payload.user_id = gtUtil.getAuthUserId(req);
        resModel = await reviews.create(payload);
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
