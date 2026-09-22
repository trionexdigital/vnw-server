import { Router, Request, Response } from 'express';
import { PrivateLinks } from './privateLinks';
import { Constants } from '../../../pixels-utility/constant';

const router = Router();
const service = new PrivateLinks();
router.post('/resolve', async (req: Request, res: Response) => res.status(Constants.HTTP_OK).json(await service.resolve(req.body || {})));
export default router;
