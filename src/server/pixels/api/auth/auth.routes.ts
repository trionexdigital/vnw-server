import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { PixelsAuth } from './auth';


const masterModel = new MasterModel();
const logger = new gtUtil.Logger();
const auth = new PixelsAuth();
const jwt = new gtUtil.JWT();
const router = Router();


router.post("/login", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    let token: string = '';
    let userID: number = 0;

    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.userLogin(payload);

        if (resModel.status != 1) {
            throw new Error('Invalid login credentials, please try again.')
        }
        userID = (resModel.data as { user_id: number }).user_id;

        token = await jwt.getJwtToken({ userID: userID, dt: new Date() });
        logger.log('TOKEN:: ' + token);
        if (token == '' || token == null || token == 'undefined') {
            throw 'Not able to generate token for authentication, contact system admin!';
        } else {
            //setting authorization header of response
            res.setHeader("token", token);
        }

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


router.post("/register", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    let token: string = '';
    let userID: number = 0;

    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.userRegister(payload);

        if (resModel.status != 1) {
            throw new Error('Unable to process registration, please try again.')
        }

        userID = (resModel.data as { user_id: number }).user_id;

        token = await jwt.getJwtToken({ userID: userID, dt: new Date() });
        logger.log('TOKEN:: ' + token);
        if (token == '' || token == null || token == 'undefined') {
            throw 'Not able to generate token for authentication, contact system admin!';
        } else {
            //setting authorization header of response
            res.setHeader("token", token);
        }

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


router.post("/forgot-request", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();

    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.requestPasswordReset(payload);

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


router.post("/change-password", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();

    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.userChangePassword(payload);

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

router.post("/me", async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload: any = { user_id: gtUtil.getAuthUserId(req) };
        resModel = await auth.getProfile(payload);
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
});

router.post("/update-profile", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();

    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.userUpdateProfile(payload);

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


router.post("/update-logo", async (req: Request, res: Response) => {

    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();

    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = await auth.userUpdateLogo(payload);

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