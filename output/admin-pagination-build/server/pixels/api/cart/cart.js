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
exports.Cart = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const prebooks_1 = require("../prebooks/prebooks");
const privateLinks_1 = require("../privateLinks/privateLinks");
class Cart {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
        this.prebooks = new prebooks_1.Prebooks();
    }
    getCartId(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const q = yield this.dao.executeQuery(`SELECT cart_id FROM carts WHERE user_id = ?`, [userId]);
            if (q.fetchedRows > 0)
                return q.rows[0].cart_id;
            const ins = yield this.dao.executeQuery(`INSERT INTO carts (user_id) VALUES (?)`, [userId]);
            return ins.insertId;
        });
    }
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const cartId = yield this.getCartId(payload.user_id);
                const q = yield this.dao.executeQuery(`SELECT ci.cart_item_id,ci.private_link_id,n.number_id, n.number_value, n.display_number, n.title_label, n.badge, n.mrp, n.offer_price,
                        n.discount_pct, n.numerology_sum, n.operator, n.status,n.visibility_type,n.rtp_status,n.rtp_available_at
                 FROM cart_items ci JOIN vip_numbers n ON n.number_id = ci.number_id
                 LEFT JOIN number_private_links pl ON pl.private_link_id=ci.private_link_id
                 LEFT JOIN number_private_link_items pli ON pli.private_link_id=pl.private_link_id AND pli.number_id=n.number_id
                 WHERE ci.cart_id = ? AND (n.visibility_type='ONLINE' OR (pli.number_id IS NOT NULL AND pl.revoked_at IS NULL AND (pl.expires_at IS NULL OR pl.expires_at>UTC_TIMESTAMP())))
                 ORDER BY ci.added_at DESC`, [cartId]);
                const numberItems = (q.rows || []).map((row) => (Object.assign(Object.assign({}, (0, categoryClassifier_1.decorateNumberCategories)(row)), { item_type: 'NUMBER', item_id: Number(row.number_id), quantity: 1, unit_price: Number(row.offer_price), line_total: Number(row.offer_price) })));
                const items = numberItems;
                const subtotal = items.reduce((s, x) => s + Number(x.line_total), 0);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { items, count: items.length, subtotal };
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
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.prebooks.reconcile();
                if (!payload.number_id)
                    throw new Error('number_id is required.');
                const cartId = yield this.getCartId(payload.user_id);
                // ensure the number exists & is available
                const chk = yield this.dao.executeQuery(`SELECT status,rtp_status,visibility_type FROM vip_numbers WHERE number_id = ?`, [payload.number_id]);
                if (chk.fetchedRows === 0)
                    throw new Error('Number not found.');
                if (chk.rows[0].status !== 'AVAILABLE')
                    throw new Error('This number is no longer available.');
                if (chk.rows[0].rtp_status === 'NON_RTP')
                    throw new Error('NON-RTP numbers must be pre-booked until their ready-to-port date.');
                let privateLinkId = null;
                if (chk.rows[0].visibility_type === 'OFFLINE') {
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
                yield this.dao.executeQuery(`INSERT INTO cart_items (cart_id,number_id,private_link_id) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE private_link_id=VALUES(private_link_id)`, [cartId, payload.number_id, privateLinkId]);
                resModel.status = 1;
                resModel.info = 'Added to cart.';
                resModel.data = yield (yield this.list(payload)).data;
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
    /** Atomically validates and adds a complete curated pack to the user's cart. */
    addMany(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            let connection;
            try {
                yield this.prebooks.reconcile();
                const ids = Array.isArray(payload.number_ids)
                    ? payload.number_ids.map(Number).filter((id) => id > 0) : [];
                const uniqueIds = Array.from(new Set(ids));
                if (uniqueIds.length !== ids.length)
                    throw new Error('The selected pack contains duplicate numbers.');
                if (uniqueIds.length < 2 || uniqueIds.length > 10)
                    throw new Error('Choose a pack containing 2 to 10 numbers.');
                connection = yield this.dao.getConnection();
                yield connection.beginTransaction();
                const [numbers] = yield connection.query(`SELECT number_id, display_number, status, stock, rtp_status,visibility_type FROM vip_numbers
                 WHERE number_id IN (${uniqueIds.map(() => '?').join(',')}) FOR UPDATE`, uniqueIds);
                if ((numbers || []).length !== uniqueIds.length)
                    throw new Error('One or more pack numbers no longer exist.');
                const unavailable = (numbers || []).find((number) => number.status !== 'AVAILABLE' || Number(number.stock) <= 0 || number.rtp_status === 'NON_RTP');
                if (unavailable)
                    throw new Error(`${unavailable.display_number} is no longer available. Refresh the pack and try again.`);
                if ((numbers || []).some((number) => number.visibility_type && number.visibility_type !== 'ONLINE'))
                    throw new Error('Private Offline numbers cannot be added through a public family pack.');
                const [carts] = yield connection.query('SELECT cart_id FROM carts WHERE user_id = ? FOR UPDATE', [payload.user_id]);
                let cartId = Number((_a = carts === null || carts === void 0 ? void 0 : carts[0]) === null || _a === void 0 ? void 0 : _a.cart_id) || 0;
                if (!cartId) {
                    const [insert] = yield connection.query('INSERT INTO carts (user_id) VALUES (?)', [payload.user_id]);
                    cartId = Number(insert.insertId);
                }
                for (const numberId of uniqueIds) {
                    yield connection.query('INSERT IGNORE INTO cart_items (cart_id, number_id) VALUES (?, ?)', [cartId, numberId]);
                }
                yield connection.commit();
                resModel.status = 1;
                resModel.info = `${uniqueIds.length} numbers added to cart.`;
                resModel.data = (yield this.list(payload)).data;
            }
            catch (error) {
                if (connection) {
                    try {
                        yield connection.rollback();
                    }
                    catch ( /* best effort */_b) { /* best effort */ }
                }
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                if (connection)
                    connection.release();
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
                const cartId = yield this.getCartId(payload.user_id);
                yield this.dao.executeQuery(`DELETE FROM cart_items WHERE cart_id = ? AND number_id = ?`, [cartId, payload.number_id]);
                resModel.status = 1;
                resModel.info = 'Removed from cart.';
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
    clear(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const cartId = yield this.getCartId(payload.user_id);
                yield this.dao.executeQuery(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
                resModel.status = 1;
                resModel.info = 'Cart cleared.';
                resModel.data = { items: [], count: 0, subtotal: 0 };
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
exports.Cart = Cart;
//# sourceMappingURL=cart.js.map