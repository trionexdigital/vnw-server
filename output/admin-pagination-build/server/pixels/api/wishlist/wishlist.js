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
exports.Wishlist = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const privateLinks_1 = require("../privateLinks/privateLinks");
class Wishlist {
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
                const q = yield this.dao.executeQuery(`SELECT w.wishlist_id,w.private_link_id,n.number_id,n.number_value,n.display_number,n.title_label,n.badge,n.mrp,n.offer_price,
                        n.discount_pct,n.numerology_sum,n.operator,n.status,n.stock,n.visibility_type,n.rtp_status,n.rtp_available_at
                 FROM wishlist w JOIN vip_numbers n ON n.number_id = w.number_id
                 LEFT JOIN number_private_links pl ON pl.private_link_id=w.private_link_id
                 LEFT JOIN number_private_link_items pli ON pli.private_link_id=pl.private_link_id AND pli.number_id=n.number_id
                 WHERE w.user_id = ? AND (n.visibility_type='ONLINE' OR (pli.number_id IS NOT NULL AND pl.revoked_at IS NULL AND (pl.expires_at IS NULL OR pl.expires_at>UTC_TIMESTAMP())))
                 ORDER BY w.created_at DESC`, [payload.user_id]);
                const items = (q.rows || []).map((row) => (0, categoryClassifier_1.decorateNumberCategories)(row));
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { items, count: items.length };
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
    add(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                if (!payload.number_id)
                    throw new Error('number_id is required.');
                const number = yield this.dao.executeQuery('SELECT visibility_type FROM vip_numbers WHERE number_id=?', [payload.number_id]);
                if (!((_a = number.rows) === null || _a === void 0 ? void 0 : _a.length))
                    throw new Error('Number not found.');
                let privateLinkId = null;
                if (number.rows[0].visibility_type === 'OFFLINE') {
                    const connection = yield this.dao.getConnection();
                    try {
                        const link = yield (0, privateLinks_1.resolvePrivateLinkWithConnection)(connection, String(payload.private_token || ''), Number(payload.number_id));
                        if (!link)
                            throw new Error('This Offline number is only available through its active private link.');
                        privateLinkId = Number(link.private_link_id);
                    }
                    finally {
                        connection.release();
                    }
                }
                yield this.dao.executeQuery(`INSERT INTO wishlist (user_id,number_id,private_link_id) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE private_link_id=VALUES(private_link_id)`, [payload.user_id, payload.number_id, privateLinkId]);
                resModel.status = 1;
                resModel.info = 'Added to wishlist.';
                resModel.data = (yield this.list(payload)).data;
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
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.dao.executeQuery(`DELETE FROM wishlist WHERE user_id = ? AND number_id = ?`, [payload.user_id, payload.number_id]);
                resModel.status = 1;
                resModel.info = 'Removed from wishlist.';
                resModel.data = (yield this.list(payload)).data;
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
}
exports.Wishlist = Wishlist;
//# sourceMappingURL=wishlist.js.map