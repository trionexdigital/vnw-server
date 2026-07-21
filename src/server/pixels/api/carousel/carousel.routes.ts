import { Router, Request, Response } from 'express';
import { MasterModel } from '../../../models/MasterModel';
import * as gtUtil from '../../../pixels-utility';
import { CarouselStudio } from './carousel';

const router = Router();
const studio = new CarouselStudio();
const masterModel = new MasterModel();

router.post('/list', async (_req: Request, res: Response) => {
    const response = await studio.publicList();
    res.status(gtUtil.Constants.HTTP_OK).json(response);
});

async function binary(req: Request, res: Response, previewOnly: boolean) {
    try {
        const asset = await studio.getAsset(Number(req.params.id), true, previewOnly);
        if (!asset) return res.status(404).end();
        const etag = `\"${asset.content_sha256}\"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.setHeader('Content-Type', asset.mime_type);
        res.setHeader('Content-Length', String(asset.byte_size));
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('ETag', etag);
        return res.status(200).send(asset.content);
    } catch { return res.status(404).end(); }
}

router.get('/asset/:id', (req, res) => { void binary(req, res, false); });
router.get('/preview/:id', (req, res) => { void binary(req, res, true); });

export default router;

