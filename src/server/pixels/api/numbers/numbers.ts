import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import axios from 'axios';
import {
    CATEGORY_CATALOG,
    CATEGORY_CLASSIFIER_VERSION,
    categoryMatchToApiModel,
    classifyNumber,
    decorateNumberCategories,
    isCategorySlug,
    normalizeIndianNumber,
    syncNumberCategories,
} from '../categories/categoryClassifier';

const SELECT_COLS = `n.number_id, n.number_value, n.display_number,
    n.seller_id, n.seller_type, n.title_label, n.badge, n.mrp, n.offer_price, n.discount_pct,
    n.numerology_sum, n.operator, n.description, n.stock, n.status, n.is_featured, n.views, n.created_at`;

export class Numbers {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public catalog listing with filters, search, sorting and pagination. */
    async list(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const where: string[] = [];
            const params: any[] = [];

            // Public browsing only shows AVAILABLE unless an explicit status is requested (admin).
            const status = payload.status ? String(payload.status).toUpperCase() : 'AVAILABLE';
            if (status !== 'ALL') { where.push('n.status = ?'); params.push(status); }

            if (payload.category !== undefined && payload.category !== null && payload.category !== '') {
                const category = String(payload.category).trim();
                if (!isCategorySlug(category)) throw new Error(`Unknown category slug: ${category}`);
                where.push(`EXISTS (
                    SELECT 1 FROM vip_number_categories vnc
                    WHERE vnc.number_id = n.number_id
                      AND vnc.category_slug = ? AND vnc.classifier_version = ?
                )`);
                params.push(category, CATEGORY_CLASSIFIER_VERSION);
            }
            if (payload.q) {
                const q = '%' + String(payload.q).replace(/\s+/g, '') + '%';
                where.push('(REPLACE(n.display_number, " ", "") LIKE ? OR n.number_value LIKE ?)');
                params.push(q, q);
            }
            if (payload.price_min) { where.push('n.offer_price >= ?'); params.push(Number(payload.price_min)); }
            if (payload.price_max) { where.push('n.offer_price <= ?'); params.push(Number(payload.price_max)); }
            if (payload.numerology) { where.push('n.numerology_sum = ?'); params.push(Number(payload.numerology)); }
            if (payload.operator) { where.push('n.operator = ?'); params.push(String(payload.operator)); }
            if (payload.badge) { where.push('n.badge = ?'); params.push(String(payload.badge).toUpperCase()); }
            if (payload.is_featured) { where.push('n.is_featured = 1'); }
            if (payload.seller_id) { where.push('n.seller_id = ?'); params.push(Number(payload.seller_id)); }

            const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

            let orderBy = 'n.created_at DESC';
            switch (payload.sort) {
                case 'price_asc': orderBy = 'n.offer_price ASC'; break;
                case 'price_desc': orderBy = 'n.offer_price DESC'; break;
                case 'popular': orderBy = 'n.views DESC'; break;
                case 'discount': orderBy = 'n.discount_pct DESC'; break;
                default: orderBy = 'n.created_at DESC';
            }

            const page = Math.max(1, Number(payload.page) || 1);
            const limit = Math.min(60, Math.max(1, Number(payload.limit) || 12));
            const offset = (page - 1) * limit;

            const countQ: any = await this.dao.executeQuery(
                `SELECT COUNT(*) AS total FROM vip_numbers n ${whereSql}`,
                params
            );
            if (countQ.status !== 1) throw new Error(countQ.info || 'Unable to count numbers.');
            const total = Number(countQ.rows?.[0]?.total) || 0;

            const rowsQ: any = await this.dao.executeQuery(
                `SELECT ${SELECT_COLS} FROM vip_numbers n
                 ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );
            if (rowsQ.status !== 1) throw new Error(rowsQ.info || 'Unable to load numbers.');

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                items: (rowsQ.rows || []).map((row: any) => decorateNumberCategories(row)),
                total, page, limit,
                pages: Math.ceil(total / limit),
            };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Featured numbers for the landing page. */
    async featured(payload: any) {
        return this.list({ ...payload, is_featured: 1, limit: payload.limit || 8, sort: 'newest' });
    }

    private localAiFilters(query: string) {
        const text = String(query || '').toLowerCase();
        const compact = text.replace(/\s+/g, '');
        const filters: any = { limit: 12, sort: 'popular' };
        const explanation: string[] = [];

        const numberMatch = compact.match(/\d{2,}/);
        if (numberMatch) {
            filters.q = numberMatch[0];
            explanation.push(`matched digits ${numberMatch[0]}`);
        }

        const sumMatch = text.match(/(?:sum|total|numerology)\s*(?:is|=|of)?\s*([1-9])/);
        if (sumMatch) {
            filters.numerology = Number(sumMatch[1]);
            explanation.push(`numerology sum ${sumMatch[1]}`);
        }

        const priceMatch = text.match(/(?:under|below|less than|upto|up to)\s*(?:rs\.?|₹|inr)?\s*([\d,]+)/);
        if (priceMatch) {
            filters.price_max = Number(priceMatch[1].replace(/,/g, ''));
            explanation.push(`under ₹${filters.price_max.toLocaleString('en-IN')}`);
        }

        const category = [...CATEGORY_CATALOG]
            .sort((left, right) => left.priority - right.priority)
            .find((candidate) => {
                const phrases = [candidate.slug.replace(/-/g, ' '), candidate.name, ...candidate.aliases]
                    .map((phrase) => phrase.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim());
                return phrases.some((phrase) => phrase && text.includes(phrase));
            });
        if (category) {
            filters.category = category.slug;
            explanation.push(`${category.name} category`);
        }

        if (/(jio|airtel|vi|vodafone|idea|bsnl)/.test(text)) {
            const op = text.match(/jio|airtel|vi|vodafone|idea|bsnl/)?.[0] || '';
            filters.operator = op === 'vodafone' || op === 'idea' ? 'Vi' : op.toUpperCase() === 'VI' ? 'Vi' : op[0].toUpperCase() + op.slice(1);
            explanation.push(`${filters.operator} operator`);
        }

        if (/(cheap|budget|low price|affordable)/.test(text)) filters.sort = 'price_asc';
        if (/(discount|deal|offer)/.test(text)) filters.sort = 'discount';

        return { filters, explanation: explanation.length ? explanation.join(', ') : 'best available VIP numbers' };
    }

    private async openAiFilters(query: string) {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return null;
        try {
            const response = await axios.post('https://api.openai.com/v1/responses', {
                model: process.env.OPENAI_SEARCH_MODEL || 'gpt-4.1-mini',
                input: [
                    {
                        role: 'system',
                        content: `Convert VIP mobile number search text into JSON filters. Return only JSON with keys: q, category, numerology, price_min, price_max, operator, badge, sort, explanation. Allowed sort: newest, price_asc, price_desc, discount, popular. Allowed category slugs: ${CATEGORY_CATALOG.map((category) => category.slug).join(', ')}.`
                    },
                    { role: 'user', content: query }
                ],
                text: { format: { type: 'json_object' } }
            }, {
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                timeout: 12000,
            });
            const raw = response.data?.output_text || response.data?.output?.[0]?.content?.[0]?.text || '{}';
            const parsed = JSON.parse(raw);
            return {
                filters: {
                    q: parsed.q || undefined,
                    category: isCategorySlug(parsed.category) ? parsed.category : undefined,
                    numerology: parsed.numerology || undefined,
                    price_min: parsed.price_min || undefined,
                    price_max: parsed.price_max || undefined,
                    operator: parsed.operator || undefined,
                    badge: parsed.badge || undefined,
                    sort: parsed.sort || 'popular',
                    limit: 12,
                },
                explanation: parsed.explanation || 'AI matched your request to the closest VIP numbers',
            };
        } catch (error) {
            this.logger.error('OpenAI AI search fallback: ' + error);
            return null;
        }
    }

    async aiSearch(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const query = String(payload.query || payload.q || '').trim();
            if (!query) throw new Error('query is required.');
            const ai = await this.openAiFilters(query);
            const parsed = ai || this.localAiFilters(query);
            const result: any = await this.list({ ...parsed.filters, status: 'AVAILABLE', page: payload.page || 1 });
            resModel.status = result.status;
            resModel.info = result.info;
            resModel.data = {
                ...(result.data || {}),
                ai: {
                    query,
                    explanation: parsed.explanation,
                    mode: ai ? 'openai' : 'local',
                    filters: parsed.filters,
                },
            };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Single number detail (increments views). */
    async detail(payload: { number_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.number_id);
            if (!id) throw new Error('number_id is required.');
            await this.dao.executeQuery(`UPDATE vip_numbers SET views = views + 1 WHERE number_id = ?`, [id]);
            const q: any = await this.dao.executeQuery(
                `SELECT ${SELECT_COLS}, u.full_name AS seller_name FROM vip_numbers n
                 LEFT JOIN auth_user u ON u.user_id = n.seller_id WHERE n.number_id = ?`, [id]
            );
            if (q.fetchedRows === 0) throw new Error('Number not found.');

            // Attach approved reviews + average rating.
            const rev: any = await this.dao.executeQuery(
                `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 WHERE r.number_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC LIMIT 20`, [id]
            );
            const data = decorateNumberCategories(q.rows[0]);
            data.reviews = rev.rows || [];
            data.avg_rating = data.reviews.length
                ? Number((data.reviews.reduce((s: number, x: any) => s + x.rating, 0) / data.reviews.length).toFixed(1)) : 0;

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = data;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Create a listing. seller context (id/type/initial status) is supplied by caller. */
    async create(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        let connection: any;
        try {
            const number_value = normalizeIndianNumber(payload.number_value ?? payload.display_number);
            const display_number = String(payload.display_number || payload.number_value || number_value).trim();
            if (normalizeIndianNumber(display_number) !== number_value) {
                throw new Error('Display number must match the submitted mobile number.');
            }
            const mrp = Number(payload.mrp) || 0;
            const offer = Number(payload.offer_price) || mrp;
            const discount = mrp > 0 ? Math.round(((mrp - offer) / mrp) * 100) : 0;

            connection = await this.dao.getConnection();
            let insertId = 0;
            let classification: ReturnType<typeof classifyNumber>;
            await connection.beginTransaction();
            try {
                const [result]: any = await connection.query(
                `INSERT INTO vip_numbers (number_value, display_number, seller_id, seller_type,
                 title_label, badge, mrp, offer_price, discount_pct, numerology_sum, operator, description, stock, status, is_featured)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [number_value, display_number, payload.seller_id, payload.seller_type || 'ADMIN',
                 payload.title_label || 'VIP Number', (payload.badge || 'NONE').toUpperCase(), mrp, offer, discount,
                 payload.numerology_sum || null, payload.operator || null, payload.description || null,
                 Number(payload.stock) || 1, payload.status || 'AVAILABLE', payload.is_featured ? 1 : 0]
                );
                insertId = Number(result?.insertId) || 0;
                if (!insertId) throw new Error('Unable to create listing.');
                classification = await syncNumberCategories(connection, insertId, number_value);
                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            }

            const deprecationWarning = payload.category_id !== undefined
                ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                : undefined;
            if (deprecationWarning) this.logger.info(deprecationWarning);
            resModel.status = 1;
            resModel.info = deprecationWarning || 'OK';
            resModel.data = {
                number_id: insertId,
                categories: classification!.categories.map(categoryMatchToApiModel),
                primary_category: categoryMatchToApiModel(classification!.primaryCategory),
                category_name: classification!.primaryCategory.name,
                category_slug: classification!.primaryCategory.slug,
                classifier_version: classification!.classifierVersion,
                ...(deprecationWarning ? { deprecation_warning: deprecationWarning } : {}),
            };
        } catch (error) {
            resModel.status = -33;
            const detail = error instanceof Error ? error.message : String(error);
            resModel.info = /duplicate/i.test(detail) ? 'This number is already listed.' : 'catch : ' + detail;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { connection?.release(); } catch { }
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Update a listing. If owner_id is provided, the update is scoped to that seller. */
    async update(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        let connection: any;
        try {
            const id = Number(payload.number_id);
            if (!id) throw new Error('number_id is required.');

            connection = await this.dao.getConnection();
            let classification: ReturnType<typeof classifyNumber>;
            await connection.beginTransaction();
            try {
                const ownerScope = payload.owner_id ? ' AND seller_id = ?' : '';
                const ownerParams = payload.owner_id ? [id, Number(payload.owner_id)] : [id];
                const [rows]: any = await connection.query(
                    `SELECT number_value, display_number, mrp, offer_price
                     FROM vip_numbers WHERE number_id = ?${ownerScope} FOR UPDATE`, ownerParams);
                if (!Array.isArray(rows) || rows.length === 0) throw new Error('Number not found.');
                const current = rows[0];

                const numberValue = payload.number_value !== undefined
                    ? normalizeIndianNumber(payload.number_value)
                    : payload.display_number !== undefined
                        ? normalizeIndianNumber(payload.display_number)
                        : normalizeIndianNumber(current.number_value);
                const displayNumber = payload.display_number !== undefined
                    ? String(payload.display_number).trim()
                    : payload.number_value !== undefined
                        ? String(payload.number_value).trim()
                        : String(current.display_number);
                if (normalizeIndianNumber(displayNumber) !== numberValue) {
                    throw new Error('Display number must match the submitted mobile number.');
                }

                const fields: string[] = [];
                const params: any[] = [];
                if (numberValue !== String(current.number_value)) {
                    fields.push('number_value = ?');
                    params.push(numberValue);
                }
                if (displayNumber !== String(current.display_number)) {
                    fields.push('display_number = ?');
                    params.push(displayNumber);
                }

                const allowed = ['title_label', 'badge', 'mrp', 'offer_price',
                    'numerology_sum', 'operator', 'description', 'stock', 'status', 'is_featured'];
                for (const key of allowed) {
                    if (payload[key] === undefined) continue;
                    fields.push(`${key} = ?`);
                    params.push(key === 'is_featured'
                        ? (payload[key] ? 1 : 0)
                        : key === 'badge' ? String(payload[key]).toUpperCase() : payload[key]);
                }

                if (payload.mrp !== undefined || payload.offer_price !== undefined) {
                    const mrp = payload.mrp !== undefined ? Number(payload.mrp) : Number(current.mrp);
                    const offer = payload.offer_price !== undefined ? Number(payload.offer_price) : Number(current.offer_price);
                    fields.push('discount_pct = ?');
                    params.push(mrp > 0 ? Math.round(((mrp - offer) / mrp) * 100) : 0);
                }

                const categoryOnlyCompatibilityCall = fields.length === 0 && payload.category_id !== undefined;
                if (fields.length === 0 && !categoryOnlyCompatibilityCall) throw new Error('Nothing to update.');
                if (fields.length > 0) {
                    const updateParams = [...params, id, ...(payload.owner_id ? [Number(payload.owner_id)] : [])];
                    await connection.query(
                        `UPDATE vip_numbers SET ${fields.join(', ')} WHERE number_id = ?${ownerScope}`,
                        updateParams,
                    );
                }

                classification = numberValue !== String(current.number_value)
                    ? await syncNumberCategories(connection, id, numberValue)
                    : classifyNumber(numberValue);
                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            }

            const deprecationWarning = payload.category_id !== undefined
                ? 'category_id is deprecated and was ignored; categories are detected automatically.'
                : undefined;
            if (deprecationWarning) this.logger.info(deprecationWarning);
            resModel.status = 1;
            resModel.info = deprecationWarning || 'OK';
            resModel.data = {
                number_id: id,
                categories: classification!.categories.map(categoryMatchToApiModel),
                primary_category: categoryMatchToApiModel(classification!.primaryCategory),
                category_name: classification!.primaryCategory.name,
                category_slug: classification!.primaryCategory.slug,
                classifier_version: classification!.classifierVersion,
                ...(deprecationWarning ? { deprecation_warning: deprecationWarning } : {}),
            };
        } catch (error) {
            resModel.status = -33;
            const detail = error instanceof Error ? error.message : String(error);
            resModel.info = /duplicate/i.test(detail) ? 'This number is already listed.' : 'catch : ' + detail;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { connection?.release(); } catch { }
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async remove(payload: { number_id: number, owner_id?: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.number_id);
            if (!id) throw new Error('number_id is required.');
            const params: any[] = [id];
            let scope = '';
            if (payload.owner_id) { scope = ' AND seller_id = ?'; params.push(Number(payload.owner_id)); }
            await this.dao.executeQuery(`DELETE FROM vip_numbers WHERE number_id = ?${scope}`, params);
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { number_id: id };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }
}
