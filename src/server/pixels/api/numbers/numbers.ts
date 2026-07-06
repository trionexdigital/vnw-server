import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import axios from 'axios';

const SELECT_COLS = `n.number_id, n.number_value, n.display_number, n.category_id, c.name AS category_name, c.slug AS category_slug,
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

            if (payload.category) {
                if (!isNaN(Number(payload.category))) { where.push('n.category_id = ?'); params.push(Number(payload.category)); }
                else { where.push('c.slug = ?'); params.push(String(payload.category)); }
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
                `SELECT COUNT(*) AS total FROM vip_numbers n LEFT JOIN categories c ON c.category_id = n.category_id ${whereSql}`,
                params
            );
            const total = countQ.rows?.[0]?.total || 0;

            const rowsQ: any = await this.dao.executeQuery(
                `SELECT ${SELECT_COLS} FROM vip_numbers n LEFT JOIN categories c ON c.category_id = n.category_id
                 ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                items: rowsQ.rows || [],
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

        if (/(premium|elite|royal|signature)/.test(text)) { filters.category = 'premium'; explanation.push('premium category'); }
        else if (/(business|brand|company|startup)/.test(text)) { filters.category = 'business'; explanation.push('business category'); }
        else if (/(lucky|luck|destiny|numerology)/.test(text)) { filters.category = 'lucky'; explanation.push('lucky category'); }
        else if (/(fancy|pattern|repeat|repeating|mirror)/.test(text)) { filters.category = 'fancy'; explanation.push('fancy category'); }

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
                        content: 'Convert VIP mobile number search text into JSON filters. Return only JSON with keys: q, category, numerology, price_min, price_max, operator, badge, sort, explanation. Allowed sort: newest, price_asc, price_desc, discount, popular. Allowed category slugs: business, fancy, lucky, premium, easy-to-remember.'
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
                    category: parsed.category || undefined,
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
                 LEFT JOIN categories c ON c.category_id = n.category_id
                 LEFT JOIN auth_user u ON u.user_id = n.seller_id WHERE n.number_id = ?`, [id]
            );
            if (q.fetchedRows === 0) throw new Error('Number not found.');

            // Attach approved reviews + average rating.
            const rev: any = await this.dao.executeQuery(
                `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name FROM reviews r
                 LEFT JOIN auth_user u ON u.user_id = r.user_id
                 WHERE r.number_id = ? AND r.status = 'APPROVED' ORDER BY r.created_at DESC LIMIT 20`, [id]
            );
            const data = q.rows[0];
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
        try {
            const number_value = String(payload.number_value || '').replace(/\s+/g, '');
            const display_number = String(payload.display_number || payload.number_value || '').trim();
            if (!number_value) throw new Error('Number is required.');
            const mrp = Number(payload.mrp) || 0;
            const offer = Number(payload.offer_price) || mrp;
            const discount = mrp > 0 ? Math.round(((mrp - offer) / mrp) * 100) : 0;

            const q: any = await this.dao.executeQuery(
                `INSERT INTO vip_numbers (number_value, display_number, category_id, seller_id, seller_type,
                 title_label, badge, mrp, offer_price, discount_pct, numerology_sum, operator, description, stock, status, is_featured)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [number_value, display_number, payload.category_id || null, payload.seller_id, payload.seller_type || 'ADMIN',
                 payload.title_label || 'VIP Number', (payload.badge || 'NONE').toUpperCase(), mrp, offer, discount,
                 payload.numerology_sum || null, payload.operator || null, payload.description || null,
                 Number(payload.stock) || 1, payload.status || 'AVAILABLE', payload.is_featured ? 1 : 0]
            );
            if (q.status !== 1 || q.insertId === 0) {
                let msg = q.info && /duplicate/i.test(q.info) ? 'This number is already listed.' : 'Unable to create listing.';
                throw new Error(msg);
            }
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = { number_id: q.insertId };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Update a listing. If owner_id is provided, the update is scoped to that seller. */
    async update(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.number_id);
            if (!id) throw new Error('number_id is required.');

            const fields: string[] = [];
            const params: any[] = [];
            const allowed = ['display_number', 'category_id', 'title_label', 'badge', 'mrp', 'offer_price',
                'numerology_sum', 'operator', 'description', 'stock', 'status', 'is_featured'];
            for (const k of allowed) {
                if (payload[k] !== undefined) {
                    fields.push(`${k} = ?`);
                    params.push(k === 'is_featured' ? (payload[k] ? 1 : 0) : k === 'badge' ? String(payload[k]).toUpperCase() : payload[k]);
                }
            }
            // recompute discount if pricing changed
            if (payload.mrp !== undefined && payload.offer_price !== undefined) {
                const mrp = Number(payload.mrp), offer = Number(payload.offer_price);
                fields.push('discount_pct = ?'); params.push(mrp > 0 ? Math.round(((mrp - offer) / mrp) * 100) : 0);
            }
            if (fields.length === 0) throw new Error('Nothing to update.');
            params.push(id);

            let scope = '';
            if (payload.owner_id) { scope = ' AND seller_id = ?'; params.push(Number(payload.owner_id)); }

            const q: any = await this.dao.executeQuery(
                `UPDATE vip_numbers SET ${fields.join(', ')} WHERE number_id = ?${scope}`, params
            );
            if (q.status !== 1) throw new Error(q.info || 'Unable to update listing.');
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
