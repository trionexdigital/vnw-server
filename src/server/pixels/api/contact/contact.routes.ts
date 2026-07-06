import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { PixelsContact } from './contact';

const masterModel = new MasterModel();
const logger = new gtUtil.Logger();
const contact = new PixelsContact();
const router = Router();

/** Public — visitors submit contact queries (no authentication required). */
router.post("/submit", async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = await contact.submit(payload);

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
});

export default router;
