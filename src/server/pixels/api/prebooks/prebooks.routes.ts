import { Router, Request, Response } from 'express';
import { MasterModel } from '../../../models/MasterModel';
import * as gtUtil from '../../../pixels-utility';
import { Prebooks } from './prebooks';

const router = Router();
const service = new Prebooks();
const master = new MasterModel();
const handle = (fn: (p: any) => Promise<any>, publicRoute = false) => async (req: Request, res: Response) => {
  let response = master.getResponseModel();
  try {
    const payload = req.body || {};
    if (!publicRoute) payload.user_id = gtUtil.getAuthUserId(req);
    response = await fn(payload);
  } catch (error) { response.status = -9; response.info = 'catch: ' + error; }
  res.status(gtUtil.Constants.HTTP_OK).json(response);
};

router.post('/catalog', handle((p) => service.catalog(p), true));
router.post('/create', handle((p) => service.create(p)));
router.post('/quote', handle((p) => service.quote(p)));
router.post('/my', handle((p) => service.my(p)));
router.post('/cancel', handle((p) => service.cancel(p)));
router.post('/report-issue', handle((p) => service.reportIssue(p)));

export default router;
