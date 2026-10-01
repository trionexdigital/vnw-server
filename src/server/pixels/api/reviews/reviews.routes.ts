import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Reviews } from './reviews';
import { ReviewScreenshots } from './reviewScreenshots';

const masterModel = new MasterModel();
const reviews = new Reviews();
const screenshots = new ReviewScreenshots();
const router = Router();

router.post('/screenshots', async (_req: Request, res: Response) => res.status(gtUtil.Constants.HTTP_OK).json(await screenshots.list()));
router.get('/screenshots/:id/image', async (req: Request, res: Response) => {
    try {
        const image = await screenshots.image(Number(req.params.id));
        if (!image?.image_data) return res.status(404).end();
        const etag = `"${image.image_sha256}"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.setHeader('Content-Type', image.image_mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', etag);
        return res.status(200).send(image.image_data);
    } catch { return res.status(404).end(); }
});

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
