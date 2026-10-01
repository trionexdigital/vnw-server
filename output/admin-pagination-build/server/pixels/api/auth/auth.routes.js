"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const MasterModel_1 = require("../../../models/MasterModel");
const gtUtil = __importStar(require("../../../pixels-utility"));
const auth_1 = require("./auth");
const masterModel = new MasterModel_1.MasterModel();
const logger = new gtUtil.Logger();
const auth = new auth_1.PixelsAuth();
const jwt = new gtUtil.JWT();
const router = (0, express_1.Router)();
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    let token = '';
    let userID = 0;
    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.userLogin(payload);
        if (resModel.status != 1) {
            throw new Error('Invalid login credentials, please try again.');
        }
        userID = resModel.data.user_id;
        token = yield jwt.getJwtToken({ userID: userID, dt: new Date() });
        logger.log('TOKEN:: ' + token);
        if (token == '' || token == null || token == 'undefined') {
            throw 'Not able to generate token for authentication, contact system admin!';
        }
        else {
            //setting authorization header of response
            res.setHeader("token", token);
        }
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    let token = '';
    let userID = 0;
    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.userRegister(payload);
        if (resModel.status != 1) {
            throw new Error('Unable to process registration, please try again.');
        }
        userID = resModel.data.user_id;
        token = yield jwt.getJwtToken({ userID: userID, dt: new Date() });
        logger.log('TOKEN:: ' + token);
        if (token == '' || token == null || token == 'undefined') {
            throw 'Not able to generate token for authentication, contact system admin!';
        }
        else {
            //setting authorization header of response
            res.setHeader("token", token);
        }
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/forgot-request", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    try {
        payload = req.body;
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.requestPasswordReset(payload);
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/change-password", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.userChangePassword(payload);
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/me", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        const payload = { user_id: gtUtil.getAuthUserId(req) };
        resModel = yield auth.getProfile(payload);
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/update-profile", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.userUpdateProfile(payload);
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
router.post("/update-logo", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // getting response model
    let startMS = new Date().getTime();
    let payload;
    let resModel = masterModel.getResponseModel();
    try {
        payload = req.body;
        payload.user_id = gtUtil.getAuthUserId(req); // A01: act on the authenticated account only
        // **** dont change above code, please wtite your router code below **** //
        resModel = yield auth.userUpdateLogo(payload);
        // **** dont change below code, write your code baove this only **** //
    }
    catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error + ' : ' + resModel.info;
        logger.error(req.path + ' : ' + JSON.stringify(resModel));
    }
    finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
}));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map