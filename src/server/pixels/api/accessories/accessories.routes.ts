import { Router, Request, Response } from 'express';
import { MasterModel } from '../../../models/MasterModel';
import * as gtUtil from '../../../pixels-utility';
import { Accessories } from './accessories';

const router = Router();
const service = new Accessories();
const master = new MasterModel();

const send = (fn: (payload: any) => Promise<any>) => async (req: Request, res: Response) => {
  let result = master.getResponseModel();
  try { result = await fn(req.body || {}); } catch (error) { result.status = -9; result.info = 'catch: ' + error; }
  res.status(gtUtil.Constants.HTTP_OK).json(result);
};
router.post('/list', send((p) => service.list(p, false)));
router.post('/detail', send((p) => service.detail(p, false)));
router.get('/image/:id', async (req: Request, res: Response) => {
  try {
    const image = await service.image(Number(req.params.id));
    if (!image) return res.status(404).end();
    const etag = `\"${image.content_sha256}\"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.setHeader('Content-Type', image.mime_type); res.setHeader('Content-Length', String(image.byte_size));
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400'); res.setHeader('ETag', etag);
    return res.status(200).send(image.content);
  } catch { return res.status(404).end(); }
});
router.post('/returns/list', async (req: Request, res: Response) => {
  let result = master.getResponseModel();
  try { result = await service.returns({ ...(req.body || {}), user_id: gtUtil.getAuthUserId(req) }, false); }
  catch (error) { result.status = -9; result.info = 'catch: ' + error; }
  res.status(gtUtil.Constants.HTTP_OK).json(result);
});
router.post('/returns/request', async (req: Request, res: Response) => {
  let result = master.getResponseModel();
  try { result = await service.requestReturn({ ...(req.body || {}), user_id: gtUtil.getAuthUserId(req) }); }
  catch (error) { result.status = -9; result.info = 'catch: ' + error; }
  res.status(gtUtil.Constants.HTTP_OK).json(result);
});

export default router;
