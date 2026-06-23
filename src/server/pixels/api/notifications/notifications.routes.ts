import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Notifications } from './notifications';

const masterModel = new MasterModel();
const logger = new gtUtil.Logger();
const notifications = new Notifications();
const router = Router();

const handle = (fn: (payload: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: scope notifications to the token user
        // **** dont change above code, please wtite your router code below **** //
        resModel = await fn(payload);

        // **** dont change below code, write your code baove this only **** //
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
};

router.post("/register", handle((p) => notifications.register(p)));
router.post("/update", handle((p) => notifications.update(p)));
router.post("/mark-all-read", handle((p) => notifications.markAllRead(p)));
router.post("/get", handle((p) => notifications.get(p)));

export default router;
