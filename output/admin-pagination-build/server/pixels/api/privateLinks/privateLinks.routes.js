"use strict";
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
const privateLinks_1 = require("./privateLinks");
const constant_1 = require("../../../pixels-utility/constant");
const router = (0, express_1.Router)();
const service = new privateLinks_1.PrivateLinks();
router.post('/resolve', (req, res) => __awaiter(void 0, void 0, void 0, function* () { return res.status(constant_1.Constants.HTTP_OK).json(yield service.resolve(req.body || {})); }));
exports.default = router;
//# sourceMappingURL=privateLinks.routes.js.map