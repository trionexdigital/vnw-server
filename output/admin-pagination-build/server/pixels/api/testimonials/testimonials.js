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
exports.Testimonials = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
class Testimonials {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = (payload === null || payload === void 0 ? void 0 : payload.all) ? '' : 'WHERE is_active = 1';
                const q = yield this.dao.executeQuery(`SELECT * FROM testimonials ${where} ORDER BY sort_order ASC, testimonial_id DESC`, []);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    save(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                if (!payload.name || !payload.content)
                    throw new Error('Name and content are required.');
                if (payload.testimonial_id) {
                    yield this.dao.executeQuery(`UPDATE testimonials SET name=?, role=?, avatar=?, content=?, rating=?, is_active=?, sort_order=? WHERE testimonial_id=?`, [payload.name, payload.role || null, payload.avatar || null, payload.content, Number(payload.rating) || 5,
                        payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0, Number(payload.testimonial_id)]);
                    resModel.data = { testimonial_id: Number(payload.testimonial_id) };
                }
                else {
                    const q = yield this.dao.executeQuery(`INSERT INTO testimonials (name, role, avatar, content, rating, is_active, sort_order) VALUES (?,?,?,?,?,?,?)`, [payload.name, payload.role || null, payload.avatar || null, payload.content, Number(payload.rating) || 5,
                        payload.is_active === false ? 0 : 1, Number(payload.sort_order) || 0]);
                    resModel.data = { testimonial_id: q.insertId };
                }
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    remove(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.dao.executeQuery(`DELETE FROM testimonials WHERE testimonial_id = ?`, [Number(payload.testimonial_id)]);
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Testimonials = Testimonials;
//# sourceMappingURL=testimonials.js.map