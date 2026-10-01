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
exports.MarketplaceContent = void 0;
const crypto_1 = require("crypto");
const database_1 = require("../../../gen_db/database");
const MasterModel_1 = require("../../../models/MasterModel");
const categoryClassifier_1 = require("../categories/categoryClassifier");
const prebooks_1 = require("../prebooks/prebooks");
const PACK_TYPES = ['SERIES', 'MIXED', 'SIMILAR_START', 'SIMILAR_END', 'SIMILAR_BOTH'];
const CLIENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const NUMBER_COLUMNS = `n.number_id, n.number_value, n.display_number, n.title_label, n.badge,
  n.mrp, n.offer_price, n.discount_pct, n.numerology_sum, n.operator, n.stock, n.status,
  n.rtp_status, n.rtp_available_at, n.is_featured`;
const activeFlag = (value) => (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false' ? 0 : 1);
const text = (value, max) => String(value !== null && value !== void 0 ? value : '').trim().slice(0, max);
class MarketplaceContent {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.masterModel = new MasterModel_1.MasterModel();
        this.prebooks = new prebooks_1.Prebooks();
    }
    response() { return this.masterModel.getResponseModel(); }
    canonicalNumber(item) {
        return String(item.number_value || item.display_number || '').replace(/\D/g, '');
    }
    generatedPack(type, numbers, index, match = '') {
        const labels = {
            SERIES: 'Numbers in Series',
            MIXED: 'All Mixed',
            SIMILAR_START: 'Similar Start',
            SIMILAR_END: 'Similar End',
            SIMILAR_BOTH: 'Similar Both Ends',
        };
        const descriptions = {
            SERIES: 'A live set of consecutive VIP numbers, ready to add together.',
            MIXED: 'A varied selection of currently available VIP numbers.',
            SIMILAR_START: `Every number begins with ${match}.`,
            SIMILAR_END: `Every number ends with ${match}.`,
            SIMILAR_BOTH: `Every number shares ${match}.`,
        };
        const ids = numbers.map((item) => Number(item.number_id)).join('-');
        return {
            pack_id: `AUTO-${type}-${ids}`,
            title: `${labels[type]}${match ? ` · ${match}` : ''} ${index + 1}`,
            pack_type: type,
            description: descriptions[type],
            sort_order: index,
            is_active: true,
            numbers,
            size: numbers.length,
            total_price: numbers.reduce((sum, item) => sum + Number(item.offer_price || 0), 0),
            is_available: true,
        };
    }
    groupedPacks(rows, type, size, limit) {
        const output = [];
        const used = new Set();
        const append = (numbers, match = '') => {
            if (output.length >= limit || numbers.length !== size)
                return;
            numbers.forEach((item) => used.add(Number(item.number_id)));
            output.push(this.generatedPack(type, numbers, output.length, match));
        };
        if (type === 'MIXED') {
            for (let cursor = 0; cursor + size <= rows.length && output.length < limit; cursor += size) {
                append(rows.slice(cursor, cursor + size));
            }
            return output;
        }
        if (type === 'SERIES') {
            const sorted = [...rows].sort((a, b) => {
                return Number(this.canonicalNumber(a)) - Number(this.canonicalNumber(b));
            });
            let run = [];
            const flush = () => {
                for (let cursor = 0; cursor + size <= run.length && output.length < limit; cursor += size) {
                    append(run.slice(cursor, cursor + size));
                }
            };
            for (const item of sorted) {
                const previous = run[run.length - 1];
                if (!previous || Number(this.canonicalNumber(item)) === Number(this.canonicalNumber(previous)) + 1)
                    run.push(item);
                else {
                    flush();
                    run = [item];
                }
            }
            flush();
            return output;
        }
        const levels = type === 'SIMILAR_BOTH'
            ? [[4, 4], [3, 3], [2, 2], [1, 1]]
            : [[7, 0], [6, 0], [5, 0], [4, 0], [3, 0], [2, 0]];
        for (const [firstLength, bothEndLength] of levels) {
            if (output.length >= limit)
                break;
            const buckets = new Map();
            for (const item of rows) {
                if (used.has(Number(item.number_id)))
                    continue;
                const digits = this.canonicalNumber(item);
                const key = type === 'SIMILAR_START'
                    ? digits.slice(0, firstLength)
                    : type === 'SIMILAR_END'
                        ? digits.slice(-firstLength)
                        : `${digits.slice(0, firstLength)}…${digits.slice(-bothEndLength)}`;
                buckets.set(key, [...(buckets.get(key) || []), item]);
            }
            for (const [key, bucket] of buckets) {
                const available = bucket.filter((item) => !used.has(Number(item.number_id)));
                for (let cursor = 0; cursor + size <= available.length && output.length < limit; cursor += size) {
                    append(available.slice(cursor, cursor + size), key);
                }
            }
        }
        return output;
    }
    packs() {
        return __awaiter(this, arguments, void 0, function* (payload = {}) {
            var _a;
            const res = this.response();
            try {
                yield this.prebooks.reconcile();
                const type = text(payload.pack_type || 'MIXED', 32).toUpperCase();
                const size = Number((_a = payload.size) !== null && _a !== void 0 ? _a : 3);
                const limit = Math.min(24, Math.max(1, Number(payload.limit) || 12));
                if (!PACK_TYPES.includes(type))
                    throw new Error('Choose a valid matching type.');
                if (!Number.isInteger(size) || size < 2 || size > 10)
                    throw new Error('Pack size must be between 2 and 10.');
                const q = yield this.dao.executeQuery(`SELECT ${NUMBER_COLUMNS}
         FROM vip_numbers n
         WHERE n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE' AND n.rtp_status IN ('RTP','RTA')
         ORDER BY n.is_featured DESC, n.views DESC, n.created_at DESC, n.number_id DESC`, []);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load available numbers.');
                const rows = (q.rows || [])
                    .filter((row) => this.canonicalNumber(row).length === 10)
                    .map((row) => (0, categoryClassifier_1.decorateNumberCategories)(Object.assign(Object.assign({}, row), { is_premium: Boolean(Number(row.is_featured)) })));
                res.status = 1;
                res.info = 'OK';
                res.data = this.groupedPacks(rows, type, size, limit);
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    operators() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const q = yield this.dao.executeQuery(`SELECT TRIM(operator) AS operator, COUNT(*) AS count
         FROM vip_numbers WHERE status = 'AVAILABLE' AND stock > 0 AND visibility_type='ONLINE' AND TRIM(operator) IN ('Airtel','Jio','Vi','BSNL')
         GROUP BY TRIM(operator) ORDER BY FIELD(operator,'Airtel','Jio','Vi','BSNL')`, []);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load operators.');
                res.status = 1;
                res.info = 'OK';
                res.data = (q.rows || []).map((row) => ({ operator: row.operator, count: Number(row.count) }));
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    clients() {
        return __awaiter(this, arguments, void 0, function* (all = false) {
            const res = this.response();
            try {
                const q = yield this.dao.executeQuery(`SELECT client_id, name, website_url, alt_text, logo_mime, logo_sha256, sort_order, is_active, created_at, updated_at,
                CASE WHEN logo_data IS NULL THEN 0 ELSE 1 END AS has_logo
         FROM trusted_clients ${all ? '' : 'WHERE is_active = 1'} ORDER BY sort_order ASC, client_id ASC`, []);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load trusted clients.');
                res.status = 1;
                res.info = 'OK';
                res.data = (q.rows || []).map((row) => (Object.assign(Object.assign({}, row), { client_id: Number(row.client_id), sort_order: Number(row.sort_order), is_active: Boolean(Number(row.is_active)), has_logo: Boolean(Number(row.has_logo)), logo_url: Number(row.has_logo) ? `/vipnumberworld/site/trusted-clients/${row.client_id}/logo` : null })));
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    clientLogo(clientId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const q = yield this.dao.executeQuery('SELECT logo_mime, logo_data, logo_sha256 FROM trusted_clients WHERE client_id = ? AND logo_data IS NOT NULL LIMIT 1', [clientId]);
            return q.status === 1 ? ((_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) || null : null;
        });
    }
    clientSave(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const clientId = Number(payload.client_id) || 0;
                const name = text(payload.name, 96);
                if (!name)
                    throw new Error('Client name is required.');
                const website = text(payload.website_url, 512);
                if (website && !/^https?:\/\//i.test(website))
                    throw new Error('Website must use http:// or https://.');
                if (clientId) {
                    const q = yield this.dao.executeQuery('UPDATE trusted_clients SET name=?, website_url=?, alt_text=?, is_active=? WHERE client_id=?', [name, website || null, text(payload.alt_text, 160) || `${name} logo`, activeFlag(payload.is_active), clientId]);
                    if (q.status !== 1 || !q.affectedRows)
                        throw new Error('Trusted client not found.');
                    res.data = { client_id: clientId };
                }
                else {
                    const q = yield this.dao.executeQuery(`INSERT INTO trusted_clients (name, website_url, alt_text, sort_order, is_active)
           SELECT ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ? FROM trusted_clients`, [name, website || null, text(payload.alt_text, 160) || `${name} logo`, activeFlag(payload.is_active)]);
                    if (q.status !== 1 || !q.insertId)
                        throw new Error(q.info || 'Unable to add trusted client.');
                    res.data = { client_id: Number(q.insertId) };
                }
                res.status = 1;
                res.info = 'Trusted client saved.';
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    clientUpload(payload, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const clientId = Number(payload.client_id) || 0;
                if (!clientId)
                    throw new Error('client_id is required.');
                if (!file || Array.isArray(file) || !Buffer.isBuffer(file.data))
                    throw new Error('Choose one logo image.');
                if (!CLIENT_MIMES.includes(String(file.mimetype)))
                    throw new Error('Logo must be PNG, JPEG, or WebP.');
                if (file.data.length > 2 * 1024 * 1024)
                    throw new Error('Logo must be 2 MB or smaller.');
                const sha = (0, crypto_1.createHash)('sha256').update(file.data).digest('hex');
                const q = yield this.dao.executeQuery('UPDATE trusted_clients SET logo_mime=?, logo_data=?, logo_sha256=? WHERE client_id=?', [file.mimetype, file.data, sha, clientId]);
                if (q.status !== 1 || !q.affectedRows)
                    throw new Error('Trusted client not found.');
                res.status = 1;
                res.info = 'Client logo uploaded.';
                res.data = { client_id: clientId, logo_sha256: sha };
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    clientDelete(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remove('trusted_clients', 'client_id', payload.client_id, 'Trusted client');
        });
    }
    clientReorder(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.reorder('trusted_clients', 'client_id', payload.client_ids, 'Trusted clients');
        });
    }
    faqs() {
        return __awaiter(this, arguments, void 0, function* (all = false) {
            const res = this.response();
            try {
                const q = yield this.dao.executeQuery(`SELECT faq_id, category, question, answer, sort_order, is_active, created_at, updated_at
         FROM faqs ${all ? '' : 'WHERE is_active = 1'} ORDER BY sort_order ASC, faq_id ASC`, []);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load FAQs.');
                res.status = 1;
                res.info = 'OK';
                res.data = (q.rows || []).map((row) => (Object.assign(Object.assign({}, row), { faq_id: Number(row.faq_id), sort_order: Number(row.sort_order), is_active: Boolean(Number(row.is_active)) })));
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    faqSave(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const faqId = Number(payload.faq_id) || 0;
                const category = text(payload.category, 64);
                const question = text(payload.question, 255);
                const answer = text(payload.answer, 4000);
                if (!category || !question || !answer)
                    throw new Error('Category, question, and answer are required.');
                if (faqId) {
                    const q = yield this.dao.executeQuery('UPDATE faqs SET category=?, question=?, answer=?, is_active=? WHERE faq_id=?', [category, question, answer, activeFlag(payload.is_active), faqId]);
                    if (q.status !== 1 || !q.affectedRows)
                        throw new Error('FAQ not found.');
                    res.data = { faq_id: faqId };
                }
                else {
                    const q = yield this.dao.executeQuery(`INSERT INTO faqs (category, question, answer, sort_order, is_active)
           SELECT ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ? FROM faqs`, [category, question, answer, activeFlag(payload.is_active)]);
                    if (q.status !== 1 || !q.insertId)
                        throw new Error(q.info || 'Unable to add FAQ.');
                    res.data = { faq_id: Number(q.insertId) };
                }
                res.status = 1;
                res.info = 'FAQ saved.';
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    faqDelete(payload) {
        return __awaiter(this, void 0, void 0, function* () { return this.remove('faqs', 'faq_id', payload.faq_id, 'FAQ'); });
    }
    faqReorder(payload) {
        return __awaiter(this, void 0, void 0, function* () { return this.reorder('faqs', 'faq_id', payload.faq_ids, 'FAQs'); });
    }
    remove(table, idColumn, rawId, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            try {
                const id = Number(rawId) || 0;
                if (!id)
                    throw new Error(`${idColumn} is required.`);
                const q = yield this.dao.executeQuery(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [id]);
                if (q.status !== 1 || !q.affectedRows)
                    throw new Error(`${label} not found.`);
                res.status = 1;
                res.info = `${label} removed.`;
                res.data = {};
            }
            catch (error) {
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            return res;
        });
    }
    reorder(table, idColumn, rawIds, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.response();
            const ids = Array.isArray(rawIds) ? rawIds.map(Number).filter((id) => id > 0) : [];
            const unique = Array.from(new Set(ids));
            let connection;
            try {
                if (unique.length !== ids.length)
                    throw new Error(`${label} ordering contains duplicates.`);
                connection = yield this.dao.getConnection();
                yield connection.beginTransaction();
                const [rows] = yield connection.query(`SELECT ${idColumn} FROM ${table} FOR UPDATE`);
                const existing = (rows || []).map((row) => Number(row[idColumn]));
                if (existing.length !== unique.length || existing.some((id) => !unique.includes(id))) {
                    throw new Error(`${label} ordering is stale. Refresh and try again.`);
                }
                for (let index = 0; index < unique.length; index += 1) {
                    yield connection.query(`UPDATE ${table} SET sort_order=? WHERE ${idColumn}=?`, [index, unique[index]]);
                }
                yield connection.commit();
                res.status = 1;
                res.info = `${label} order updated.`;
                res.data = unique;
            }
            catch (error) {
                if (connection) {
                    try {
                        yield connection.rollback();
                    }
                    catch ( /* best effort */_a) { /* best effort */ }
                }
                res.status = -33;
                res.info = 'catch : ' + error;
            }
            finally {
                if (connection)
                    connection.release();
            }
            return res;
        });
    }
}
exports.MarketplaceContent = MarketplaceContent;
//# sourceMappingURL=marketplaceContent.js.map