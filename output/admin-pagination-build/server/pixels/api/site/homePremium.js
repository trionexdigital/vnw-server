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
exports.HomePremium = void 0;
const database_1 = require("../../../gen_db/database");
const MasterModel_1 = require("../../../models/MasterModel");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const NUMBER_COLUMNS = `n.number_id,n.number_value,n.display_number,n.seller_id,n.seller_type,n.title_label,n.badge,
  n.mrp,n.offer_price,n.discount_pct,n.numerology_sum,n.operator,n.description,n.stock,n.status,
  n.visibility_type,n.rtp_status,n.rtp_available_at,n.is_featured,n.views,n.created_at`;
class HomePremium {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.master = new MasterModel_1.MasterModel();
    }
    response() { return this.master.getResponseModel(); }
    list() {
        return __awaiter(this, arguments, void 0, function* (admin = false) {
            const res = this.response();
            try {
                const q = yield this.dao.executeQuery(`SELECT ${NUMBER_COLUMNS},h.homepage_premium_id,h.sort_order,h.is_active AS homepage_active
        FROM homepage_premium_numbers h INNER JOIN vip_numbers n ON n.number_id=h.number_id
        ${admin ? '' : "WHERE h.is_active=1 AND n.status='AVAILABLE' AND n.stock>0 AND n.visibility_type='ONLINE'"}
        ORDER BY h.sort_order,h.homepage_premium_id`, []);
                res.status = 1;
                res.info = 'OK';
                res.data = (q.rows || []).map((row) => (Object.assign(Object.assign({}, (0, categoryClassifier_1.decorateNumberCategories)(row)), { is_premium: Boolean(Number(row.is_featured)), homepage_active: Boolean(Number(row.homepage_active)) })));
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    save(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const rowId = Number(payload.homepage_premium_id) || 0;
                const numberId = Number(payload.number_id);
                if (!numberId)
                    throw new Error('Choose a catalog number.');
                if (rowId) {
                    yield this.dao.executeQuery('UPDATE homepage_premium_numbers SET number_id=?,is_active=? WHERE homepage_premium_id=?', [numberId, payload.is_active === false ? 0 : 1, rowId]);
                }
                else {
                    const q = yield this.dao.executeQuery('INSERT INTO homepage_premium_numbers (number_id,sort_order,is_active) SELECT ?,COALESCE(MAX(sort_order),-1)+1,? FROM homepage_premium_numbers', [numberId, payload.is_active === false ? 0 : 1]);
                    payload.homepage_premium_id = Number(q.insertId);
                }
                res.status = 1;
                res.info = 'Homepage selection saved.';
                res.data = { homepage_premium_id: Number(payload.homepage_premium_id || rowId) };
            }
            catch (error) {
                res.status = -33;
                res.info = /duplicate/i.test(String(error))
                    ? 'This number is already selected for the homepage.'
                    : 'catch : ' + error;
            }
            return res;
        });
    }
    remove(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                yield this.dao.executeQuery('DELETE FROM homepage_premium_numbers WHERE homepage_premium_id=?', [Number(payload.homepage_premium_id)]);
                res.status = 1;
                res.info = 'Homepage selection removed.';
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    reorder(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            let connection;
            try {
                const ids = Array.isArray(payload.homepage_premium_ids)
                    ? payload.homepage_premium_ids.map(Number)
                    : [];
                connection = yield this.dao.getConnection();
                yield connection.beginTransaction();
                const [rows] = yield connection.query('SELECT homepage_premium_id FROM homepage_premium_numbers FOR UPDATE');
                const actual = (rows || []).map((row) => Number(row.homepage_premium_id)).sort();
                if (actual.join(',') !== [...ids].sort((a, b) => a - b).join(',')) {
                    throw new Error('Homepage ordering is stale.');
                }
                for (let index = 0; index < ids.length; index += 1) {
                    yield connection.query('UPDATE homepage_premium_numbers SET sort_order=? WHERE homepage_premium_id=?', [index, ids[index]]);
                }
                yield connection.commit();
                res.status = 1;
                res.info = 'Homepage order updated.';
            }
            catch (error) {
                try {
                    yield (connection === null || connection === void 0 ? void 0 : connection.rollback());
                }
                catch ( /* best effort */_a) { /* best effort */ }
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            finally {
                connection === null || connection === void 0 ? void 0 : connection.release();
            }
            return res;
        });
    }
}
exports.HomePremium = HomePremium;
//# sourceMappingURL=homePremium.js.map