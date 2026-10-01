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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Numbers = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const axios_1 = __importDefault(require("axios"));
const categoryClassifier_1 = require("../categories/categoryClassifier");
const numberSearch_1 = require("./numberSearch");
const prebooks_1 = require("../prebooks/prebooks");
const notifications_1 = require("../notifications/notifications");
const similarNumbers_1 = require("./similarNumbers");
const privateLinks_1 = require("../privateLinks/privateLinks");
const globalPricing_1 = require("./globalPricing");
const SELECT_COLS = `n.number_id, n.number_value, n.display_number,
    n.seller_id, n.seller_type, n.title_label, n.badge, n.mrp, n.offer_price, n.discount_pct,
    n.numerology_sum, n.operator, n.description, n.stock, n.status, n.visibility_type, n.rtp_status, n.rtp_available_at,
    n.is_featured, n.views, n.created_at`;
const decorateCatalogNumber = (row) => (Object.assign(Object.assign({}, (0, categoryClassifier_1.decorateNumberCategories)(row)), { activation_type: row.rtp_status, is_premium: Boolean(Number(row.is_featured)) }));
class Numbers {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
        this.prebooks = new prebooks_1.Prebooks();
    }
    queryListing(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            yield this.prebooks.reconcile();
            const where = [];
            const params = [];
            if (!payload.admin_scope)
                where.push("n.visibility_type = 'ONLINE'", 'n.stock > 0');
            // Public browsing only shows AVAILABLE unless an explicit status is requested (admin).
            const status = payload.status ? String(payload.status).toUpperCase() : 'AVAILABLE';
            if (status !== 'ALL') {
                where.push('n.status = ?');
                params.push(status);
            }
            const hasSubcategory = payload.subcategory_id !== undefined && payload.subcategory_id !== null && payload.subcategory_id !== '';
            if (!hasSubcategory && payload.category !== undefined && payload.category !== null && payload.category !== '') {
                const category = String(payload.category).trim();
                if (!(0, categoryClassifier_1.isCategorySlug)(category))
                    throw new Error(`Unknown category slug: ${category}`);
                where.push(`EXISTS (
                SELECT 1 FROM vip_number_categories vnc
                WHERE vnc.number_id = n.number_id
                  AND vnc.category_slug = ? AND vnc.classifier_version = ?
            )`);
                params.push(category, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
            }
            if (hasSubcategory) {
                const category = String(payload.category || '').trim();
                const subcategoryId = Number(payload.subcategory_id);
                if (!(0, categoryClassifier_1.isCategorySlug)(category) || !Number.isSafeInteger(subcategoryId) || !(0, categoryClassifier_1.getSubcategoryForCategory)(category, subcategoryId)) {
                    throw new Error('Select a valid subcategory within its category.');
                }
                where.push(`EXISTS (
                SELECT 1 FROM vip_number_subcategories vns
                WHERE vns.number_id = n.number_id AND vns.category_id = ?
                  AND vns.subcategory_id = ? AND vns.classifier_version = ?
            )`);
                params.push(categoryClassifier_1.CATEGORY_CATALOG.find(item => item.slug === category).id, subcategoryId, categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION);
            }
            if (payload.q) {
                const q = '%' + String(payload.q).replace(/\s+/g, '') + '%';
                where.push('(REPLACE(n.display_number, " ", "") LIKE ? OR n.number_value LIKE ?)');
                params.push(q, q);
            }
            const priceMin = (0, numberSearch_1.validatePrice)(payload.price_min, 'price_min');
            const priceMax = (0, numberSearch_1.validatePrice)(payload.price_max, 'price_max');
            if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
                throw new Error('price_min cannot exceed price_max.');
            }
            if (priceMin !== undefined) {
                where.push('n.offer_price >= ?');
                params.push(priceMin);
            }
            if (priceMax !== undefined) {
                where.push('n.offer_price <= ?');
                params.push(priceMax);
            }
            if (payload.numerology) {
                const numerology = Number(payload.numerology);
                if (!Number.isInteger(numerology) || numerology < 1 || numerology > 9) {
                    throw new Error('numerology must be from 1 to 9.');
                }
                where.push('n.numerology_sum = ?');
                params.push(numerology);
            }
            if (payload.operator) {
                where.push('n.operator = ?');
                params.push(String(payload.operator));
            }
            if (payload.badge) {
                where.push('n.badge = ?');
                params.push(String(payload.badge).toUpperCase());
            }
            if (payload.is_featured || payload.is_premium) {
                where.push('n.is_featured = 1');
            }
            if (payload.seller_id) {
                where.push('n.seller_id = ?');
                params.push(Number(payload.seller_id));
            }
            if (payload.rtp_status) {
                const rtpStatus = String(payload.rtp_status).toUpperCase();
                if (!['RTP', 'NON_RTP', 'RTA'].includes(rtpStatus))
                    throw new Error('rtp_status must be RTP, NON_RTP or RTA.');
                where.push('n.rtp_status = ?');
                params.push(rtpStatus);
            }
            if (payload.admin_scope && payload.visibility_type) {
                const visibility = String(payload.visibility_type).toUpperCase();
                if (!['ONLINE', 'OFFLINE'].includes(visibility))
                    throw new Error('visibility_type must be ONLINE or OFFLINE.');
                where.push('n.visibility_type = ?');
                params.push(visibility);
            }
            if (payload.rtp_from) {
                where.push('n.rtp_available_at >= ?');
                params.push((0, prebooks_1.istDateToUtc)(payload.rtp_from));
            }
            if (payload.rtp_to) {
                const end = new Date((0, prebooks_1.istDateToUtc)(payload.rtp_to).replace(' ', 'T') + 'Z');
                end.setUTCDate(end.getUTCDate() + 1);
                where.push('n.rtp_available_at < ?');
                params.push(end.toISOString().slice(0, 19).replace('T', ' '));
            }
            const compiled = (0, numberSearch_1.compileStructuredSearch)(payload.search);
            where.push(...compiled.where);
            params.push(...compiled.params);
            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
            let orderBy = 'n.created_at DESC';
            switch (payload.sort) {
                case 'price_asc':
                    orderBy = 'n.offer_price ASC';
                    break;
                case 'price_desc':
                    orderBy = 'n.offer_price DESC';
                    break;
                case 'popular':
                    orderBy = 'n.views DESC';
                    break;
                case 'discount':
                    orderBy = 'n.discount_pct DESC';
                    break;
                default: orderBy = 'n.created_at DESC';
            }
            const page = Math.max(1, Number(payload.page) || 1);
            const limit = Math.min(60, Math.max(1, Number(payload.limit) || 12));
            const offset = (page - 1) * limit;
            const countQ = yield this.dao.executeQuery(`SELECT COUNT(*) AS total FROM vip_numbers n ${whereSql}`, params);
            if (countQ.status !== 1)
                throw new Error(countQ.info || 'Unable to count numbers.');
            const total = Number((_b = (_a = countQ.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
            const rowsQ = yield this.dao.executeQuery(`SELECT ${SELECT_COLS} FROM vip_numbers n
             ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
            if (rowsQ.status !== 1)
                throw new Error(rowsQ.info || 'Unable to load numbers.');
            const privateLinksByNumber = new Map();
            if (payload.admin_scope && (rowsQ.rows || []).length) {
                const ids = rowsQ.rows.map((row) => Number(row.number_id));
                const assignments = yield this.dao.executeQuery(`SELECT number_id,private_link_id FROM number_private_link_items WHERE number_id IN (${ids.map(() => '?').join(',')})`, ids);
                for (const row of (assignments.rows || [])) {
                    const current = privateLinksByNumber.get(Number(row.number_id)) || [];
                    current.push(Number(row.private_link_id));
                    privateLinksByNumber.set(Number(row.number_id), current);
                }
            }
            return {
                items: (rowsQ.rows || []).map((row) => (Object.assign(Object.assign({}, decorateCatalogNumber(row)), (payload.admin_scope ? { private_link_ids: privateLinksByNumber.get(Number(row.number_id)) || [] } : {})))),
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            };
        });
    }
    operators() {
        return __awaiter(this, void 0, void 0, function* () {
            const resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT TRIM(operator) AS operator, COUNT(*) AS count FROM vip_numbers
                 WHERE status = 'AVAILABLE' AND stock > 0 AND visibility_type='ONLINE' AND TRIM(operator) IN ('Airtel','Jio','Vi','BSNL')
                 GROUP BY TRIM(operator) ORDER BY FIELD(operator,'Airtel','Jio','Vi','BSNL')`, []);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load operators.');
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = (q.rows || []).map((row) => ({ operator: row.operator, count: Number(row.count) }));
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    withoutSearchKeys(payload, keys, topLevel = []) {
        const search = Object.assign({}, (0, numberSearch_1.normalizeStructuredSearch)(payload.search));
        keys.forEach((key) => delete search[key]);
        delete search.include_alternatives;
        const next = Object.assign(Object.assign({}, payload), { search, include_alternatives: false, page: 1, limit: 6 });
        topLevel.forEach((key) => delete next[key]);
        return next;
    }
    findAlternatives(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const search = (0, numberSearch_1.normalizeStructuredSearch)(payload.search);
            const plans = [
                {
                    active: Boolean(search.exact_mask),
                    key: 'exact_mask',
                    label: 'Closest matches without the exact position mask',
                    payload: this.withoutSearchKeys(payload, ['exact_mask']),
                },
                {
                    active: Boolean(payload.q || search.starts_with || search.starts_with_pattern
                        || search.anywhere || search.ends_with || search.ends_with_pattern),
                    key: 'position_pattern',
                    label: 'Closest matches with number position or pattern relaxed',
                    payload: this.withoutSearchKeys(payload, [
                        'starts_with', 'starts_with_pattern', 'anywhere', 'ends_with', 'ends_with_pattern',
                    ], ['q']),
                },
                {
                    active: Boolean(((_a = search.must_contain) === null || _a === void 0 ? void 0 : _a.length) || ((_b = search.must_not_contain) === null || _b === void 0 ? void 0 : _b.length)),
                    key: 'inclusion_exclusion',
                    label: 'Closest matches without required or excluded digit groups',
                    payload: this.withoutSearchKeys(payload, ['must_contain', 'must_not_contain']),
                },
                {
                    active: Boolean((_c = search.digit_frequencies) === null || _c === void 0 ? void 0 : _c.length),
                    key: 'frequency',
                    label: 'Closest matches with digit frequency relaxed',
                    payload: this.withoutSearchKeys(payload, ['digit_frequencies']),
                },
                {
                    active: search.digit_sum !== undefined || search.mid_sum !== undefined || search.score_sum !== undefined
                        || Boolean(payload.numerology),
                    key: 'sums',
                    label: 'Closest matches without the requested number sums',
                    payload: this.withoutSearchKeys(payload, ['digit_sum', 'mid_sum', 'score_sum'], ['numerology']),
                },
                {
                    active: payload.price_min !== undefined && payload.price_min !== ''
                        || payload.price_max !== undefined && payload.price_max !== '',
                    key: 'price',
                    label: 'Closest matches outside the selected price range',
                    payload: this.withoutSearchKeys(payload, [], ['price_min', 'price_max']),
                },
                {
                    active: payload.subcategory_id !== undefined && payload.subcategory_id !== null && payload.subcategory_id !== '',
                    key: 'subcategory_id',
                    label: 'Other numbers in this category',
                    payload: this.withoutSearchKeys(payload, [], ['subcategory_id']),
                },
                {
                    active: Boolean(payload.category),
                    key: 'category',
                    label: 'Closest matches from other categories',
                    payload: this.withoutSearchKeys(payload, [], ['category', 'subcategory_id']),
                },
            ].filter((plan) => plan.active).slice(0, 6);
            const alternatives = [];
            const seen = new Set();
            for (const plan of plans) {
                const result = yield this.queryListing(plan.payload);
                const items = result.items.filter((item) => {
                    var _a;
                    const key = String((_a = item.number_id) !== null && _a !== void 0 ? _a : item.number_value);
                    if (seen.has(key))
                        return false;
                    seen.add(key);
                    return true;
                }).slice(0, 6);
                if (items.length)
                    alternatives.push({ relaxed_key: plan.key, label: plan.label, items });
                if (alternatives.length === 3)
                    break;
            }
            if (alternatives.length === 0) {
                const popular = yield this.queryListing({
                    status: 'AVAILABLE',
                    sort: 'popular',
                    page: 1,
                    limit: 6,
                });
                if (popular.items.length) {
                    alternatives.push({
                        relaxed_key: 'popular',
                        label: 'Popular alternatives',
                        items: popular.items.slice(0, 6),
                    });
                }
            }
            return alternatives;
        });
    }
    /** Public catalog listing with filters, structured search, sorting and pagination. */
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const startMS = new Date().getTime();
            const resModel = this.masterModel.getResponseModel();
            try {
                const data = yield this.queryListing(payload || {});
                const search = (0, numberSearch_1.normalizeStructuredSearch)(payload === null || payload === void 0 ? void 0 : payload.search);
                const includeAlternatives = (payload === null || payload === void 0 ? void 0 : payload.include_alternatives) === true || search.include_alternatives === true;
                const alternatives = data.total === 0 && includeAlternatives
                    ? yield this.findAlternatives(payload || {})
                    : [];
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = Object.assign(Object.assign({}, data), (includeAlternatives && data.total === 0 ? { alternatives } : {}));
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
    /** Featured numbers for the landing page. */
    featured(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.list(Object.assign(Object.assign({}, payload), { is_featured: 1, limit: payload.limit || 8, sort: 'newest' }));
        });
    }
    /** Public, deterministic recommendations for a single catalog number. */
    similar(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const startMS = new Date().getTime();
            const resModel = this.masterModel.getResponseModel();
            try {
                yield this.prebooks.reconcile();
                const id = Number(payload === null || payload === void 0 ? void 0 : payload.number_id);
                if (!Number.isInteger(id) || id <= 0)
                    throw new Error('number_id is required.');
                const page = Math.max(1, Number(payload === null || payload === void 0 ? void 0 : payload.page) || 1);
                const limit = Math.min(24, Math.max(1, Number(payload === null || payload === void 0 ? void 0 : payload.limit) || 12));
                const sourceQ = yield this.dao.executeQuery(`SELECT ${SELECT_COLS} FROM vip_numbers n WHERE n.number_id = ? LIMIT 1`, [id]);
                if (sourceQ.status !== 1)
                    throw new Error(sourceQ.info || 'Unable to load source number.');
                if (!((_a = sourceQ.rows) === null || _a === void 0 ? void 0 : _a.length))
                    throw new Error('Number not found.');
                const source = (0, categoryClassifier_1.decorateNumberCategories)(sourceQ.rows[0]);
                if (source.visibility_type === 'OFFLINE') {
                    const access = yield this.dao.executeQuery(`SELECT pl.private_link_id FROM number_private_links pl JOIN number_private_link_items pli ON pli.private_link_id=pl.private_link_id
                     WHERE pli.number_id=? AND pl.token_hash=? AND pl.revoked_at IS NULL AND (pl.expires_at IS NULL OR pl.expires_at>UTC_TIMESTAMP()) LIMIT 1`, [id, (0, privateLinks_1.hashPrivateToken)(String(payload.private_token || ''))]);
                    if (!((_b = access.rows) === null || _b === void 0 ? void 0 : _b.length))
                        throw new Error('Number not found.');
                }
                const sourceValue = (0, categoryClassifier_1.normalizeIndianNumber)((_c = source.number_value) !== null && _c !== void 0 ? _c : source.display_number);
                const categorySlugs = source.categories.map((category) => category.slug);
                // The priority expression brings pattern-adjacent candidates to the
                // front while still filling the bounded pool with popular inventory.
                const candidatesQ = yield this.dao.executeQuery(`SELECT ${SELECT_COLS} FROM vip_numbers n
                 WHERE n.number_id <> ? AND n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE'
                 ORDER BY CASE WHEN
                    EXISTS (SELECT 1 FROM vip_number_categories vnc
                        WHERE vnc.number_id = n.number_id
                          AND vnc.category_slug IN (${categorySlugs.length ? categorySlugs.map(() => '?').join(',') : "''"})
                          AND vnc.classifier_version = ?)
                    OR n.numerology_sum = ?
                    OR LEFT(n.number_value, 2) = ?
                    OR RIGHT(n.number_value, 2) = ?
                 THEN 0 ELSE 1 END,
                 n.views DESC, n.created_at DESC, n.number_id DESC
                 LIMIT 600`, [
                    id,
                    ...categorySlugs,
                    categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION,
                    Number(source.numerology_sum) || 0,
                    sourceValue.slice(0, 2),
                    sourceValue.slice(-2),
                ]);
                if (candidatesQ.status !== 1)
                    throw new Error(candidatesQ.info || 'Unable to load similar numbers.');
                const ranked = (0, similarNumbers_1.rankSimilarNumbers)(source, candidatesQ.rows || []);
                const total = ranked.length;
                const offset = (page - 1) * limit;
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    source: Object.assign(Object.assign({}, source), { is_premium: Boolean(Number(source.is_featured)) }),
                    items: ranked.slice(offset, offset + limit),
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                };
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
    localAiFilters(query) {
        var _a, _b, _c, _d;
        const text = String(query || '').toLowerCase();
        const compact = text.replace(/\s+/g, '');
        const filters = { limit: 12, sort: 'popular' };
        const search = {};
        const explanation = [];
        if (/^\d{1,10}$/.test(compact)) {
            search.anywhere = compact;
            explanation.push(`contains ${compact}`);
        }
        else {
            const startsMatch = text.match(/(?:starts?(?:\s+with)?|starting|shuru)\s*(?:se|with)?\s*(\d{1,10})/);
            const endsMatch = text.match(/(?:ends?(?:\s+with)?|ending|last|akhir)\s*(?:me|mein|with)?\s*(\d{1,10})/);
            const excludeMatch = text.match(/(?:without|exclude|not contain|nahi)\s*(\d{1,10})/);
            const containsMatch = text.match(/(?:contains?|include|with|ke saath)\s*(\d{1,10})/);
            if (startsMatch) {
                search.starts_with = startsMatch[1];
                explanation.push(`starts with ${startsMatch[1]}`);
            }
            if (endsMatch) {
                search.ends_with = endsMatch[1];
                explanation.push(`ends with ${endsMatch[1]}`);
            }
            if (excludeMatch) {
                search.must_not_contain = [excludeMatch[1]];
                explanation.push(`excludes ${excludeMatch[1]}`);
            }
            if (containsMatch && !excludeMatch && !startsMatch && !endsMatch) {
                search.must_contain = [containsMatch[1]];
                explanation.push(`contains ${containsMatch[1]}`);
            }
        }
        const exactMask = ((_a = compact.match(/(?:mask|position|format)([0-9?]{10})/)) === null || _a === void 0 ? void 0 : _a[1])
            || ((_b = compact.match(/^[0-9?]{10}$/)) === null || _b === void 0 ? void 0 : _b[0]);
        if (exactMask && exactMask.includes('?')) {
            search.exact_mask = exactMask;
            explanation.push(`position mask ${exactMask}`);
        }
        const sumMatch = text.match(/(?:digit|full|literal|liter)\s*sum\s*(?:is|=|of)?\s*(\d{1,2})/);
        const midMatch = text.match(/(?:mid|middle|trap)\s*sum\s*(?:is|=|of)?\s*(\d{1,2})/);
        const scoreMatch = text.match(/(?:score|root|numerology)\s*(?:sum)?\s*(?:is|=|of)?\s*([1-9])/);
        if (sumMatch && Number(sumMatch[1]) <= 90) {
            search.digit_sum = Number(sumMatch[1]);
            explanation.push(`full digit sum ${sumMatch[1]}`);
        }
        if (midMatch && Number(midMatch[1]) <= 17) {
            search.mid_sum = Number(midMatch[1]);
            explanation.push(`mid sum ${midMatch[1]}`);
        }
        if (scoreMatch) {
            search.score_sum = Number(scoreMatch[1]);
            explanation.push(`root sum ${scoreMatch[1]}`);
        }
        const frequencyMatch = text.match(/(?:digit\s*)?(\d)\s*(?:at least\s*)?(\d{1,2})\s*(?:times?|baar)/);
        if (frequencyMatch && Number(frequencyMatch[2]) >= 1 && Number(frequencyMatch[2]) <= 10) {
            search.digit_frequencies = [{
                    digit: Number(frequencyMatch[1]),
                    min: Number(frequencyMatch[2]),
                }];
            explanation.push(`${frequencyMatch[1]} at least ${frequencyMatch[2]} times`);
        }
        const presetAliases = [
            { pattern: /\bsemi[\s-]?mirror\b/, preset: 'semi_mirror' },
            { pattern: /\bmirror\b/, preset: 'mirror' },
            { pattern: /\babc[\s-]?abc\b/, preset: 'abc_abc' },
            { pattern: /\bab[\s-]?ab\b/, preset: 'ab_ab' },
            { pattern: /\bdoubling\b/, preset: 'doubling' },
            { pattern: /\bcounting\b|\bsequence\b/, preset: 'counting' },
            { pattern: /\bhexa\b|six repeated/, preset: 'hexa' },
            { pattern: /\bpenta\b|five repeated/, preset: 'penta' },
            { pattern: /\btetra\b|four repeated/, preset: 'tetra' },
            { pattern: /\btriple\b|three repeated/, preset: 'triple' },
            { pattern: /\bdouble\b|two repeated/, preset: 'double' },
        ];
        const preset = presetAliases.find((entry) => entry.pattern.test(text));
        if (preset) {
            if (/(?:end|last|akhir)/.test(text)) {
                if (!search.ends_with)
                    search.ends_with_pattern = preset.preset;
                else if (!search.starts_with)
                    search.starts_with_pattern = preset.preset;
            }
            else if (!search.starts_with) {
                search.starts_with_pattern = preset.preset;
            }
            explanation.push(`${preset.preset.replace(/_/g, ' ')} pattern`);
        }
        const priceMatch = text.match(/(?:under|below|less than|upto|up to|tak)\s*(?:rs\.?|₹|inr)?\s*([\d,.]+)\s*(lakh|lac|k)?/)
            || text.match(/(?:rs\.?|₹|inr)?\s*([\d,.]+)\s*(lakh|lac|k)?\s*(?:tak|or less|max)/);
        if (priceMatch) {
            const unit = priceMatch[2];
            const multiplier = unit === 'lakh' || unit === 'lac' ? 100000 : unit === 'k' ? 1000 : 1;
            filters.price_max = Math.min(1000000, Number(priceMatch[1].replace(/,/g, '')) * multiplier);
            explanation.push(`under ₹${filters.price_max.toLocaleString('en-IN')}`);
        }
        const taxonomy = (0, categoryClassifier_1.inferCategorySelectionFromText)(query);
        Object.assign(filters, taxonomy);
        if (taxonomy.category) {
            const category = categoryClassifier_1.CATEGORY_CATALOG.find(candidate => candidate.slug === taxonomy.category);
            explanation.push(`${category.name} category`);
            if (taxonomy.subcategory_id) {
                explanation.push(`${(_c = (0, categoryClassifier_1.getSubcategoryForCategory)(category.slug, taxonomy.subcategory_id)) === null || _c === void 0 ? void 0 : _c.name} subcategory`);
            }
        }
        if (/(jio|airtel|vi|vodafone|idea|bsnl)/.test(text)) {
            const op = ((_d = text.match(/jio|airtel|vi|vodafone|idea|bsnl/)) === null || _d === void 0 ? void 0 : _d[0]) || '';
            filters.operator = op === 'vodafone' || op === 'idea' ? 'Vi' : op.toUpperCase() === 'VI' ? 'Vi' : op[0].toUpperCase() + op.slice(1);
            explanation.push(`${filters.operator} operator`);
        }
        if (/(cheap|budget|low price|affordable)/.test(text))
            filters.sort = 'price_asc';
        if (/(discount|deal|offer)/.test(text))
            filters.sort = 'discount';
        if (Object.keys(search).length)
            filters.search = search;
        return { filters, explanation: explanation.length ? explanation.join(', ') : 'best available VIP numbers' };
    }
    openAiFilters(query) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const key = process.env.OPENAI_API_KEY;
            if (!key)
                return null;
            try {
                const response = yield axios_1.default.post('https://api.openai.com/v1/responses', {
                    model: process.env.OPENAI_SEARCH_MODEL || 'gpt-4.1-mini',
                    input: [
                        {
                            role: 'system',
                            content: `Convert VIP mobile-number search text into a JSON object. Allowed top-level keys are category, numerology, price_min, price_max, operator, badge, sort, search, explanation. search may contain only starts_with, starts_with_pattern, anywhere, ends_with, ends_with_pattern, must_contain, must_not_contain, digit_sum, mid_sum, score_sum, exact_mask, and digit_frequencies. Pattern enums: double, triple, tetra, penta, hexa, counting, doubling, abc_abc, ab_ab, mirror, semi_mirror. digit_frequencies entries have digit and optional min/max. Never invent a constraint. Allowed sort: newest, price_asc, price_desc, discount, popular. Allowed category slugs: ${categoryClassifier_1.CATEGORY_CATALOG.map((category) => category.slug).join(', ')}.`
                        },
                        { role: 'user', content: query }
                    ],
                    text: { format: { type: 'json_object' } }
                }, {
                    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                    timeout: 12000,
                });
                const raw = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.output_text) || ((_f = (_e = (_d = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.output) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.content) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) || '{}';
                const parsed = JSON.parse(raw);
                const filters = (0, numberSearch_1.sanitizeAiFilters)(parsed);
                if (filters.category && !(0, categoryClassifier_1.isCategorySlug)(filters.category))
                    delete filters.category;
                return {
                    filters,
                    explanation: typeof parsed.explanation === 'string'
                        ? parsed.explanation.slice(0, 500)
                        : 'AI matched your request to the closest VIP numbers',
                };
            }
            catch (error) {
                this.logger.error('OpenAI AI search fallback: ' + error);
                return null;
            }
        });
    }
    aiSearch(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const query = String(payload.query || payload.q || '').trim();
                if (!query)
                    throw new Error('query is required.');
                if (query.length > 500)
                    throw new Error('query must be 500 characters or fewer.');
                const ai = yield this.openAiFilters(query);
                const parsed = ai || this.localAiFilters(query);
                const inferred = (0, categoryClassifier_1.inferCategorySelectionFromText)(query, payload.category ? String(payload.category) : undefined);
                const category = payload.category || inferred.category || parsed.filters.category;
                const subcategoryId = payload.subcategory_id !== undefined && payload.subcategory_id !== null && payload.subcategory_id !== ''
                    ? payload.subcategory_id : inferred.subcategory_id;
                const result = yield this.list(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, parsed.filters), (category ? { category } : {})), (subcategoryId !== undefined ? { subcategory_id: subcategoryId } : {})), (payload.price_min !== undefined && payload.price_min !== '' ? { price_min: payload.price_min } : {})), (payload.price_max !== undefined && payload.price_max !== '' ? { price_max: payload.price_max } : {})), (payload.numerology ? { numerology: payload.numerology } : {})), (payload.badge ? { badge: payload.badge } : {})), (payload.is_premium ? { is_premium: payload.is_premium } : {})), (payload.operator ? { operator: payload.operator } : {})), (payload.sort ? { sort: payload.sort } : {})), { status: 'AVAILABLE', page: payload.page || 1, search: Object.assign(Object.assign(Object.assign({}, (parsed.filters.search || {})), (payload.search || {})), { include_alternatives: true }) }));
                resModel.status = result.status;
                resModel.info = result.info;
                resModel.data = Object.assign(Object.assign({}, (result.data || {})), { ai: {
                        query,
                        explanation: parsed.explanation,
                        mode: ai ? 'openai' : 'local',
                        filters: Object.assign(Object.assign(Object.assign({}, parsed.filters), (category ? { category } : {})), (subcategoryId !== undefined ? { subcategory_id: subcategoryId } : {})),
                    } });
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
    /** Single number detail (increments views). */
    detail(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                yield this.prebooks.reconcile();
                const id = Number(payload.number_id);
                if (!id)
                    throw new Error('number_id is required.');
                const q = yield this.dao.executeQuery(`SELECT ${SELECT_COLS}, u.full_name AS seller_name FROM vip_numbers n
                 LEFT JOIN auth_user u ON u.user_id = n.seller_id WHERE n.number_id = ?`, [id]);
                if (q.fetchedRows === 0)
                    throw new Error('Number not found.');
                if (q.rows[0].visibility_type === 'OFFLINE') {
                    const access = yield this.dao.executeQuery(`SELECT pl.private_link_id FROM number_private_links pl JOIN number_private_link_items pli ON pli.private_link_id=pl.private_link_id
                     WHERE pli.number_id=? AND pl.token_hash=? AND pl.revoked_at IS NULL AND (pl.expires_at IS NULL OR pl.expires_at>UTC_TIMESTAMP()) LIMIT 1`, [id, (0, privateLinks_1.hashPrivateToken)(String(payload.private_token || ''))]);
                    if (!((_a = access.rows) === null || _a === void 0 ? void 0 : _a.length))
                        throw new Error('Number not found.');
                }
                yield this.dao.executeQuery(`UPDATE vip_numbers SET views = views + 1 WHERE number_id = ?`, [id]);
                // Attach approved reviews + average rating.
                const rev = yield this.dao.executeQuery(`SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 WHERE r.number_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC LIMIT 20`, [id]);
                const data = Object.assign({}, decorateCatalogNumber(q.rows[0]));
                data.reviews = rev.rows || [];
                data.avg_rating = data.reviews.length
                    ? Number((data.reviews.reduce((s, x) => s + x.rating, 0) / data.reviews.length).toFixed(1)) : 0;
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = data;
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
    /** Create a listing. seller context (id/type/initial status) is supplied by caller. */
    create(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            let connection;
            try {
                yield this.prebooks.reconcile();
                const number_value = (0, categoryClassifier_1.normalizeIndianNumber)((_a = payload.number_value) !== null && _a !== void 0 ? _a : payload.display_number);
                const display_number = String(payload.display_number || payload.number_value || number_value).trim();
                if ((0, categoryClassifier_1.normalizeIndianNumber)(display_number) !== number_value) {
                    throw new Error('Display number must match the submitted mobile number.');
                }
                const mrp = Number(payload.mrp) || 0;
                if (mrp <= 0)
                    throw new Error('MRP must be greater than zero.');
                const rtpStatus = String(payload.rtp_status || 'RTA').toUpperCase();
                if (!['RTP', 'NON_RTP', 'RTA'].includes(rtpStatus))
                    throw new Error('Status must be RTP, NON-RTP or RTA.');
                const rtpAvailableAt = rtpStatus === 'NON_RTP' ? (0, prebooks_1.istDateToUtc)(payload.rtp_available_date) : null;
                if (rtpAvailableAt && new Date(rtpAvailableAt.replace(' ', 'T') + 'Z') <= new Date())
                    throw new Error('NON-RTP availability date must be in the future.');
                const visibility = String(payload.visibility_type || 'ONLINE').toUpperCase();
                if (!['ONLINE', 'OFFLINE'].includes(visibility))
                    throw new Error('Visibility must be ONLINE or OFFLINE.');
                const privateLinkIds = Array.from(new Set((payload.private_link_ids || []).map(Number).filter((id) => id > 0)));
                if (visibility === 'OFFLINE' && privateLinkIds.length === 0)
                    throw new Error('Offline numbers require at least one private collection.');
                connection = yield this.dao.getConnection();
                let insertId = 0;
                let classification;
                yield connection.beginTransaction();
                try {
                    const discount = yield (0, globalPricing_1.readGlobalDiscount)(connection);
                    const offer = (0, globalPricing_1.discountedPrice)(mrp, discount);
                    const [result] = yield connection.query(`INSERT INTO vip_numbers (number_value, display_number, seller_id, seller_type,
                 title_label, badge, mrp, offer_price, discount_pct, numerology_sum, operator, description, stock, status, visibility_type, rtp_status, rtp_available_at, is_featured)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [number_value, display_number, payload.seller_id, payload.seller_type || 'ADMIN',
                        payload.title_label || 'VIP Number', (payload.badge || 'NONE').toUpperCase(), mrp, offer, discount,
                        payload.numerology_sum || null, null, payload.description || null,
                        Number(payload.stock) || 1, payload.status || 'AVAILABLE', visibility, rtpStatus, rtpAvailableAt, payload.is_featured ? 1 : 0]);
                    insertId = Number(result === null || result === void 0 ? void 0 : result.insertId) || 0;
                    if (!insertId)
                        throw new Error('Unable to create listing.');
                    classification = yield (0, categoryClassifier_1.syncNumberCategories)(connection, insertId, number_value);
                    if (privateLinkIds.length) {
                        const [links] = yield connection.query(`SELECT private_link_id FROM number_private_links WHERE private_link_id IN (${privateLinkIds.map(() => '?').join(',')}) AND revoked_at IS NULL`, privateLinkIds);
                        if ((links || []).length !== privateLinkIds.length)
                            throw new Error('One or more private collections are unavailable.');
                        for (const linkId of privateLinkIds)
                            yield connection.query('INSERT INTO number_private_link_items (private_link_id,number_id) VALUES (?,?)', [linkId, insertId]);
                    }
                    yield connection.commit();
                }
                catch (error) {
                    yield connection.rollback();
                    throw error;
                }
                const deprecationWarning = payload.category_id !== undefined
                    ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                    : undefined;
                if (deprecationWarning)
                    this.logger.info(deprecationWarning);
                resModel.status = 1;
                resModel.info = deprecationWarning || 'OK';
                resModel.data = Object.assign({ number_id: insertId, categories: classification.categories.map(categoryClassifier_1.categoryMatchToApiModel), primary_category: classification.primaryCategory ? (0, categoryClassifier_1.categoryMatchToApiModel)(classification.primaryCategory) : null, category_name: ((_b = classification.primaryCategory) === null || _b === void 0 ? void 0 : _b.name) || null, category_slug: ((_c = classification.primaryCategory) === null || _c === void 0 ? void 0 : _c.slug) || null, classifier_version: classification.classifierVersion }, (deprecationWarning ? { deprecation_warning: deprecationWarning } : {}));
            }
            catch (error) {
                resModel.status = -33;
                const detail = error instanceof Error ? error.message : String(error);
                resModel.info = /duplicate/i.test(detail) ? 'This number is already listed.' : 'catch : ' + detail;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    connection === null || connection === void 0 ? void 0 : connection.release();
                }
                catch (_d) { }
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    /** Update a listing. If owner_id is provided, the update is scoped to that seller. */
    update(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            let connection;
            try {
                yield this.prebooks.reconcile();
                const id = Number(payload.number_id);
                if (!id)
                    throw new Error('number_id is required.');
                connection = yield this.dao.getConnection();
                let classification;
                yield connection.beginTransaction();
                try {
                    const ownerScope = payload.owner_id ? ' AND seller_id = ?' : '';
                    const ownerParams = payload.owner_id ? [id, Number(payload.owner_id)] : [id];
                    const [rows] = yield connection.query(`SELECT number_value, display_number, mrp, offer_price, status, visibility_type, rtp_status, rtp_available_at
                     FROM vip_numbers WHERE number_id = ?${ownerScope} FOR UPDATE`, ownerParams);
                    if (!Array.isArray(rows) || rows.length === 0)
                        throw new Error('Number not found.');
                    const current = rows[0];
                    let dateChangeUserId = 0;
                    const numberValue = payload.number_value !== undefined
                        ? (0, categoryClassifier_1.normalizeIndianNumber)(payload.number_value)
                        : payload.display_number !== undefined
                            ? (0, categoryClassifier_1.normalizeIndianNumber)(payload.display_number)
                            : (0, categoryClassifier_1.normalizeIndianNumber)(current.number_value);
                    const displayNumber = payload.display_number !== undefined
                        ? String(payload.display_number).trim()
                        : payload.number_value !== undefined
                            ? String(payload.number_value).trim()
                            : String(current.display_number);
                    if ((0, categoryClassifier_1.normalizeIndianNumber)(displayNumber) !== numberValue) {
                        throw new Error('Display number must match the submitted mobile number.');
                    }
                    const fields = [];
                    const params = [];
                    if (numberValue !== String(current.number_value)) {
                        fields.push('number_value = ?');
                        params.push(numberValue);
                    }
                    if (displayNumber !== String(current.display_number)) {
                        fields.push('display_number = ?');
                        params.push(displayNumber);
                    }
                    const allowed = ['title_label', 'badge',
                        'numerology_sum', 'description', 'stock', 'status', 'is_featured'];
                    for (const key of allowed) {
                        if (payload[key] === undefined)
                            continue;
                        fields.push(`${key} = ?`);
                        params.push(key === 'is_featured'
                            ? (payload[key] ? 1 : 0)
                            : key === 'badge' ? String(payload[key]).toUpperCase() : payload[key]);
                    }
                    if (payload.mrp !== undefined) {
                        const mrp = Number(payload.mrp);
                        if (!Number.isFinite(mrp) || mrp <= 0)
                            throw new Error('MRP must be greater than zero.');
                        const discount = yield (0, globalPricing_1.readGlobalDiscount)(connection);
                        fields.push('mrp = ?', 'offer_price = ?', 'discount_pct = ?');
                        params.push(mrp, (0, globalPricing_1.discountedPrice)(mrp, discount), discount);
                    }
                    if (payload.visibility_type !== undefined) {
                        const visibility = String(payload.visibility_type).toUpperCase();
                        if (!['ONLINE', 'OFFLINE'].includes(visibility))
                            throw new Error('Visibility must be ONLINE or OFFLINE.');
                        if (current.status === 'RESERVED' && visibility !== current.visibility_type)
                            throw new Error('Visibility cannot change while this number is reserved.');
                        fields.push('visibility_type = ?');
                        params.push(visibility);
                    }
                    if (payload.rtp_status !== undefined || payload.rtp_available_date !== undefined) {
                        const rtpStatus = String((_b = (_a = payload.rtp_status) !== null && _a !== void 0 ? _a : current.rtp_status) !== null && _b !== void 0 ? _b : 'RTA').toUpperCase();
                        if (!['RTP', 'NON_RTP', 'RTA'].includes(rtpStatus))
                            throw new Error('Status must be RTP, NON-RTP or RTA.');
                        if (current.status === 'RESERVED' && rtpStatus !== current.rtp_status)
                            throw new Error('RTP status cannot change while this number is reserved by an order.');
                        const rtpAvailableAt = rtpStatus === 'NON_RTP' ? (0, prebooks_1.istDateToUtc)(payload.rtp_available_date) : null;
                        if (rtpAvailableAt && new Date(rtpAvailableAt.replace(' ', 'T') + 'Z') <= new Date())
                            throw new Error('NON-RTP availability date must be in the future.');
                        const [active] = yield connection.query(`SELECT p.prebook_id,p.user_id,p.rtp_available_at_snapshot FROM prebookings p
                         WHERE p.number_id=? AND p.status IN ('BOOKED','READY','CANCEL_REQUESTED','REFUND_PENDING') LIMIT 1 FOR UPDATE`, [id]);
                        let writeRtpFields = true;
                        if (active === null || active === void 0 ? void 0 : active[0]) {
                            // Once the date has arrived reconciliation legitimately
                            // changes the inventory status to RTP. A normal admin edit
                            // must not be mistaken for removing the paid date snapshot.
                            if (rtpStatus === 'RTP' && current.rtp_status === 'RTP' && !payload.rtp_available_date) {
                                writeRtpFields = false;
                            }
                            else {
                                if (rtpStatus !== 'NON_RTP' || !rtpAvailableAt)
                                    throw new Error('RTP status cannot be removed while a paid pre-book is active.');
                                const oldDate = new Date(String(active[0].rtp_available_at_snapshot).replace(' ', 'T') + 'Z');
                                const newDate = new Date(rtpAvailableAt.replace(' ', 'T') + 'Z');
                                if (newDate > oldDate)
                                    throw new Error('A paid pre-book RTP date can only be moved earlier.');
                                yield connection.query(`UPDATE prebookings SET rtp_available_at_snapshot=? WHERE prebook_id=?`, [rtpAvailableAt, active[0].prebook_id]);
                                dateChangeUserId = Number(active[0].user_id);
                            }
                        }
                        if (writeRtpFields) {
                            fields.push('rtp_status = ?', 'rtp_available_at = ?');
                            params.push(rtpStatus, rtpAvailableAt);
                        }
                    }
                    const categoryOnlyCompatibilityCall = fields.length === 0 && payload.category_id !== undefined;
                    if (fields.length === 0 && !categoryOnlyCompatibilityCall)
                        throw new Error('Nothing to update.');
                    if (fields.length > 0) {
                        const updateParams = [...params, id, ...(payload.owner_id ? [Number(payload.owner_id)] : [])];
                        yield connection.query(`UPDATE vip_numbers SET ${fields.join(', ')} WHERE number_id = ?${ownerScope}`, updateParams);
                        if (payload.rtp_status === 'NON_RTP')
                            yield connection.query(`DELETE FROM cart_items WHERE number_id=?`, [id]);
                    }
                    if (Array.isArray(payload.private_link_ids)) {
                        const linkIds = Array.from(new Set(payload.private_link_ids.map(Number).filter((linkId) => linkId > 0)));
                        if (linkIds.length) {
                            const [links] = yield connection.query(`SELECT private_link_id FROM number_private_links WHERE private_link_id IN (${linkIds.map(() => '?').join(',')}) AND revoked_at IS NULL`, linkIds);
                            if ((links || []).length !== linkIds.length)
                                throw new Error('One or more private collections are unavailable.');
                        }
                        yield connection.query('DELETE FROM number_private_link_items WHERE number_id=?', [id]);
                        for (const linkId of linkIds)
                            yield connection.query('INSERT INTO number_private_link_items (private_link_id,number_id) VALUES (?,?)', [linkId, id]);
                    }
                    const finalVisibility = String(payload.visibility_type || current.visibility_type);
                    if (finalVisibility === 'ONLINE')
                        yield connection.query('DELETE FROM number_private_link_items WHERE number_id=?', [id]);
                    if (finalVisibility === 'OFFLINE') {
                        const [assigned] = yield connection.query('SELECT COUNT(*) AS count FROM number_private_link_items WHERE number_id=?', [id]);
                        if (Number(((_c = assigned === null || assigned === void 0 ? void 0 : assigned[0]) === null || _c === void 0 ? void 0 : _c.count) || 0) === 0)
                            throw new Error('Offline numbers require at least one private collection.');
                    }
                    classification = numberValue !== String(current.number_value)
                        ? yield (0, categoryClassifier_1.syncNumberCategories)(connection, id, numberValue)
                        : (0, categoryClassifier_1.classifyNumber)(numberValue);
                    yield connection.commit();
                    if (dateChangeUserId) {
                        yield (0, notifications_1.pushNotification)({ user_id: dateChangeUserId, type: 'order', title: 'RTP date moved earlier', message: `${displayNumber} will be ready sooner than originally scheduled.` });
                    }
                }
                catch (error) {
                    yield connection.rollback();
                    throw error;
                }
                const deprecationWarning = payload.category_id !== undefined
                    ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                    : undefined;
                if (deprecationWarning)
                    this.logger.info(deprecationWarning);
                resModel.status = 1;
                resModel.info = deprecationWarning || 'OK';
                resModel.data = Object.assign({ number_id: id, categories: classification.categories.map(categoryClassifier_1.categoryMatchToApiModel), primary_category: classification.primaryCategory ? (0, categoryClassifier_1.categoryMatchToApiModel)(classification.primaryCategory) : null, category_name: ((_d = classification.primaryCategory) === null || _d === void 0 ? void 0 : _d.name) || null, category_slug: ((_e = classification.primaryCategory) === null || _e === void 0 ? void 0 : _e.slug) || null, classifier_version: classification.classifierVersion }, (deprecationWarning ? { deprecation_warning: deprecationWarning } : {}));
            }
            catch (error) {
                resModel.status = -33;
                const detail = error instanceof Error ? error.message : String(error);
                resModel.info = /duplicate/i.test(detail) ? 'This number is already listed.' : 'catch : ' + detail;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    connection === null || connection === void 0 ? void 0 : connection.release();
                }
                catch (_f) { }
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
                const id = Number(payload.number_id);
                if (!id)
                    throw new Error('number_id is required.');
                const params = [id];
                let scope = '';
                if (payload.owner_id) {
                    scope = ' AND seller_id = ?';
                    params.push(Number(payload.owner_id));
                }
                yield this.dao.executeQuery(`DELETE FROM vip_numbers WHERE number_id = ?${scope}`, params);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { number_id: id };
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
exports.Numbers = Numbers;
//# sourceMappingURL=numbers.js.map