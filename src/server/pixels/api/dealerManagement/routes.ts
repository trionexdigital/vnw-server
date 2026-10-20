import { Router, Request, Response } from 'express';
import { getAuthUserId } from '../../../pixels-utility/authContext';
import { DealerManagement } from './service';
export function dealerManagementRouter(service = new DealerManagement()) {
  const router = Router();
  router.post('/:action', async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const data = req.params.action === 'capabilities' ? await service.capabilities(userId) : await service.execute(userId, req.params.action, req.body || {});
      res.json({
        status: 1,
        info: 'OK',
        data
      });
    } catch (e: any) {
      const databaseError = e?.code || String(e?.message).includes('SQL');
      const message = databaseError ? e?.code === 'ER_DUP_ENTRY' ? 'A number, login link, or dealer code already exists. Reload and try again.' : 'Module database operation failed. Check migration and server logs.' : String(e?.message || 'Module request failed.');
      res.json({
        status: -1,
        info: message,
        data: null
      });
    }
  });
  return router;
}
export default dealerManagementRouter();
