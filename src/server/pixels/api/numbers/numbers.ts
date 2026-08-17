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
import {
    StructuredNumberSearch,
    compileStructuredSearch,
    normalizeStructuredSearch,
    sanitizeAiFilters,
    validatePrice,
} from './numberSearch';
import { Prebooks, istDateToUtc } from '../prebooks/prebooks';
import { pushNotification } from '../notifications/notifications';

const SELECT_COLS = `n.number_id, n.number_value, n.display_number,
    n.seller_id, n.seller_type, n.title_label, n.badge, n.mrp, n.offer_price, n.discount_pct,
    n.numerology_sum, n.operator, n.description, n.stock, n.status, n.rtp_status, n.rtp_available_at,
    n.is_featured, n.views, n.created_at`;

interface ListingResult {
    items: any[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

interface SearchAlternative {
    relaxed_key: string;
    label: string;
    items: any[];
}

export class Numbers {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;
    private prebooks: Prebooks;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
        this.prebooks = new Prebooks();
    }

    private async queryListing(payload: any): Promise<ListingResult> {
        await this.prebooks.reconcile();
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

        const priceMin = validatePrice(payload.price_min, 'price_min');
        const priceMax = validatePrice(payload.price_max, 'price_max');
        if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
            throw new Error('price_min cannot exceed price_max.');
        }
        if (priceMin !== undefined) { where.push('n.offer_price >= ?'); params.push(priceMin); }
        if (priceMax !== undefined) { where.push('n.offer_price <= ?'); params.push(priceMax); }

        if (payload.numerology) {
            const numerology = Number(payload.numerology);
            if (!Number.isInteger(numerology) || numerology < 1 || numerology > 9) {
                throw new Error('numerology must be from 1 to 9.');
            }
            where.push('n.numerology_sum = ?');
            params.push(numerology);
        }
        if (payload.operator) { where.push('n.operator = ?'); params.push(String(payload.operator)); }
        if (payload.badge) { where.push('n.badge = ?'); params.push(String(payload.badge).toUpperCase()); }
        if (payload.is_featured || payload.is_premium) { where.push('n.is_featured = 1'); }
        if (payload.seller_id) { where.push('n.seller_id = ?'); params.push(Number(payload.seller_id)); }
        if (payload.rtp_status) {
            const rtpStatus = String(payload.rtp_status).toUpperCase();
            if (!['RTP', 'NON_RTP'].includes(rtpStatus)) throw new Error('rtp_status must be RTP or NON_RTP.');
            where.push('n.rtp_status = ?'); params.push(rtpStatus);
        }
        if (payload.rtp_from) { where.push('n.rtp_available_at >= ?'); params.push(istDateToUtc(payload.rtp_from)); }
        if (payload.rtp_to) {
            const end = new Date(istDateToUtc(payload.rtp_to).replace(' ', 'T') + 'Z');
            end.setUTCDate(end.getUTCDate() + 1);
            where.push('n.rtp_available_at < ?'); params.push(end.toISOString().slice(0, 19).replace('T', ' '));
        }

        const compiled = compileStructuredSearch(payload.search);
        where.push(...compiled.where);
        params.push(...compiled.params);
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
            params,
        );
        if (countQ.status !== 1) throw new Error(countQ.info || 'Unable to count numbers.');
        const total = Number(countQ.rows?.[0]?.total) || 0;

        const rowsQ: any = await this.dao.executeQuery(
            `SELECT ${SELECT_COLS} FROM vip_numbers n
             ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
            [...params, limit, offset],
        );
        if (rowsQ.status !== 1) throw new Error(rowsQ.info || 'Unable to load numbers.');

        return {
            items: (rowsQ.rows || []).map((row: any) => ({
                ...decorateNumberCategories(row),
                is_premium: Boolean(Number(row.is_featured)),
            })),
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        };
    }

    async operators() {
        const resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT TRIM(operator) AS operator, COUNT(*) AS count FROM vip_numbers
                 WHERE status = 'AVAILABLE' AND stock > 0 AND TRIM(operator) IN ('Airtel','Jio','Vi','BSNL')
                 GROUP BY TRIM(operator) ORDER BY FIELD(operator,'Airtel','Jio','Vi','BSNL')`, [],
            );
            if (q.status !== 1) throw new Error(q.info || 'Unable to load operators.');
            resModel.status = 1; resModel.info = 'OK';
            resModel.data = (q.rows || []).map((row: any) => ({ operator: row.operator, count: Number(row.count) }));
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    private withoutSearchKeys(payload: any, keys: Array<keyof StructuredNumberSearch>, topLevel: string[] = []) {
        const search = { ...normalizeStructuredSearch(payload.search) } as any;
        keys.forEach((key) => delete search[key]);
        delete search.include_alternatives;
        const next = { ...payload, search, include_alternatives: false, page: 1, limit: 6 };
        topLevel.forEach((key) => delete next[key]);
        return next;
    }

    private async findAlternatives(payload: any): Promise<SearchAlternative[]> {
        const search = normalizeStructuredSearch(payload.search);
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
                active: Boolean(search.must_contain?.length || search.must_not_contain?.length),
                key: 'inclusion_exclusion',
                label: 'Closest matches without required or excluded digit groups',
                payload: this.withoutSearchKeys(payload, ['must_contain', 'must_not_contain']),
            },
            {
                active: Boolean(search.digit_frequencies?.length),
                key: 'frequency',
                label: 'Closest matches with digit frequency relaxed',
                payload: this.withoutSearchKeys(payload, ['digit_frequencies']),
            },
            {
                active: search.digit_sum !== undefined || search.mid_sum !== undefined || search.score_sum !== undefined
                    || Boolean(payload.numerology),
                key: 'sums',
                label: 'Closest matches without the requested number sums',
                payload: this.withoutSearchKeys(
                    payload,
                    ['digit_sum', 'mid_sum', 'score_sum'],
                    ['numerology'],
                ),
            },
            {
                active: payload.price_min !== undefined && payload.price_min !== ''
                    || payload.price_max !== undefined && payload.price_max !== '',
                key: 'price',
                label: 'Closest matches outside the selected price range',
                payload: this.withoutSearchKeys(payload, [], ['price_min', 'price_max']),
            },
            {
                active: Boolean(payload.category),
                key: 'category',
                label: 'Closest matches from other categories',
                payload: this.withoutSearchKeys(payload, [], ['category']),
            },
        ].filter((plan) => plan.active).slice(0, 6);

        const alternatives: SearchAlternative[] = [];
        const seen = new Set<string>();
        for (const plan of plans) {
            const result = await this.queryListing(plan.payload);
            const items = result.items.filter((item: any) => {
                const key = String(item.number_id ?? item.number_value);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).slice(0, 6);
            if (items.length) alternatives.push({ relaxed_key: plan.key, label: plan.label, items });
            if (alternatives.length === 3) break;
        }

        if (alternatives.length === 0) {
            const popular = await this.queryListing({
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
    }

    /** Public catalog listing with filters, structured search, sorting and pagination. */
    async list(payload: any) {
        const startMS = new Date().getTime();
        const resModel = this.masterModel.getResponseModel();
        try {
            const data = await this.queryListing(payload || {});
            const search = normalizeStructuredSearch(payload?.search);
            const includeAlternatives = payload?.include_alternatives === true || search.include_alternatives === true;
            const alternatives = data.total === 0 && includeAlternatives
                ? await this.findAlternatives(payload || {})
                : [];
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                ...data,
                ...(includeAlternatives && data.total === 0 ? { alternatives } : {}),
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
        const search: StructuredNumberSearch = {};
        const explanation: string[] = [];

        if (/^\d{1,10}$/.test(compact)) {
            search.anywhere = compact;
            explanation.push(`contains ${compact}`);
        } else {
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

        const exactMask = compact.match(/(?:mask|position|format)([0-9?]{10})/)?.[1]
            || compact.match(/^[0-9?]{10}$/)?.[0];
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

        const presetAliases: Array<{ pattern: RegExp; preset: any }> = [
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
                if (!search.ends_with) search.ends_with_pattern = preset.preset;
                else if (!search.starts_with) search.starts_with_pattern = preset.preset;
            } else if (!search.starts_with) {
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
        if (Object.keys(search).length) filters.search = search;

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
                        content: `Convert VIP mobile-number search text into a JSON object. Allowed top-level keys are category, numerology, price_min, price_max, operator, badge, sort, search, explanation. search may contain only starts_with, starts_with_pattern, anywhere, ends_with, ends_with_pattern, must_contain, must_not_contain, digit_sum, mid_sum, score_sum, exact_mask, and digit_frequencies. Pattern enums: double, triple, tetra, penta, hexa, counting, doubling, abc_abc, ab_ab, mirror, semi_mirror. digit_frequencies entries have digit and optional min/max. Never invent a constraint. Allowed sort: newest, price_asc, price_desc, discount, popular. Allowed category slugs: ${CATEGORY_CATALOG.map((category) => category.slug).join(', ')}.`
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
            const filters: any = sanitizeAiFilters(parsed);
            if (filters.category && !isCategorySlug(filters.category)) delete filters.category;
            return {
                filters,
                explanation: typeof parsed.explanation === 'string'
                    ? parsed.explanation.slice(0, 500)
                    : 'AI matched your request to the closest VIP numbers',
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
            if (query.length > 500) throw new Error('query must be 500 characters or fewer.');
            const ai = await this.openAiFilters(query);
            const parsed = ai || this.localAiFilters(query);
            const result: any = await this.list({
                ...parsed.filters,
                ...(payload.category ? { category: payload.category } : {}),
                ...(payload.price_min !== undefined && payload.price_min !== '' ? { price_min: payload.price_min } : {}),
                ...(payload.price_max !== undefined && payload.price_max !== '' ? { price_max: payload.price_max } : {}),
                ...(payload.numerology ? { numerology: payload.numerology } : {}),
                ...(payload.badge ? { badge: payload.badge } : {}),
                ...(payload.operator ? { operator: payload.operator } : {}),
                ...(payload.sort ? { sort: payload.sort } : {}),
                status: 'AVAILABLE',
                page: payload.page || 1,
                search: {
                    ...(parsed.filters.search || {}),
                    ...(payload.search || {}),
                    include_alternatives: true,
                },
            });
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
            await this.prebooks.reconcile();
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
            const data = {
                ...decorateNumberCategories(q.rows[0]),
                is_premium: Boolean(Number(q.rows[0].is_featured)),
            };
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
            await this.prebooks.reconcile();
            const number_value = normalizeIndianNumber(payload.number_value ?? payload.display_number);
            const display_number = String(payload.display_number || payload.number_value || number_value).trim();
            if (normalizeIndianNumber(display_number) !== number_value) {
                throw new Error('Display number must match the submitted mobile number.');
            }
            const mrp = Number(payload.mrp) || 0;
            const offer = Number(payload.offer_price) || mrp;
            const discount = mrp > 0 ? Math.round(((mrp - offer) / mrp) * 100) : 0;
            const rtpStatus = String(payload.rtp_status || 'RTP').toUpperCase();
            if (!['RTP', 'NON_RTP'].includes(rtpStatus)) throw new Error('RTP Status must be RTP or NON-RTP.');
            const rtpAvailableAt = rtpStatus === 'NON_RTP' ? istDateToUtc(payload.rtp_available_date) : null;
            if (rtpAvailableAt && new Date(rtpAvailableAt.replace(' ', 'T') + 'Z') <= new Date()) throw new Error('NON-RTP availability date must be in the future.');

            connection = await this.dao.getConnection();
            let insertId = 0;
            let classification: ReturnType<typeof classifyNumber>;
            await connection.beginTransaction();
            try {
                const [result]: any = await connection.query(
                `INSERT INTO vip_numbers (number_value, display_number, seller_id, seller_type,
                 title_label, badge, mrp, offer_price, discount_pct, numerology_sum, operator, description, stock, status, rtp_status, rtp_available_at, is_featured)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [number_value, display_number, payload.seller_id, payload.seller_type || 'ADMIN',
                 payload.title_label || 'VIP Number', (payload.badge || 'NONE').toUpperCase(), mrp, offer, discount,
                 payload.numerology_sum || null, payload.operator || null, payload.description || null,
                 Number(payload.stock) || 1, payload.status || 'AVAILABLE', rtpStatus, rtpAvailableAt, payload.is_featured ? 1 : 0]
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
            await this.prebooks.reconcile();
            const id = Number(payload.number_id);
            if (!id) throw new Error('number_id is required.');

            connection = await this.dao.getConnection();
            let classification: ReturnType<typeof classifyNumber>;
            await connection.beginTransaction();
            try {
                const ownerScope = payload.owner_id ? ' AND seller_id = ?' : '';
                const ownerParams = payload.owner_id ? [id, Number(payload.owner_id)] : [id];
                const [rows]: any = await connection.query(
                    `SELECT number_value, display_number, mrp, offer_price, status, rtp_status, rtp_available_at
                     FROM vip_numbers WHERE number_id = ?${ownerScope} FOR UPDATE`, ownerParams);
                if (!Array.isArray(rows) || rows.length === 0) throw new Error('Number not found.');
                const current = rows[0];
                let dateChangeUserId = 0;

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

                if (payload.rtp_status !== undefined || payload.rtp_available_date !== undefined) {
                    const rtpStatus = String(payload.rtp_status ?? current.rtp_status ?? 'RTP').toUpperCase();
                    if (!['RTP', 'NON_RTP'].includes(rtpStatus)) throw new Error('RTP Status must be RTP or NON-RTP.');
                    if (current.status === 'RESERVED' && rtpStatus !== current.rtp_status) throw new Error('RTP status cannot change while this number is reserved by an order.');
                    const rtpAvailableAt = rtpStatus === 'NON_RTP' ? istDateToUtc(payload.rtp_available_date) : null;
                    if (rtpAvailableAt && new Date(rtpAvailableAt.replace(' ', 'T') + 'Z') <= new Date()) throw new Error('NON-RTP availability date must be in the future.');
                    const [active]: any = await connection.query(
                        `SELECT p.prebook_id,p.user_id,p.rtp_available_at_snapshot FROM prebookings p
                         WHERE p.number_id=? AND p.status IN ('BOOKED','READY','CANCEL_REQUESTED','REFUND_PENDING') LIMIT 1 FOR UPDATE`, [id],
                    );
                    let writeRtpFields = true;
                    if (active?.[0]) {
                        // Once the date has arrived reconciliation legitimately
                        // changes the inventory status to RTP. A normal admin edit
                        // must not be mistaken for removing the paid date snapshot.
                        if (rtpStatus === 'RTP' && current.rtp_status === 'RTP' && !payload.rtp_available_date) {
                            writeRtpFields = false;
                        } else {
                            if (rtpStatus !== 'NON_RTP' || !rtpAvailableAt) throw new Error('RTP status cannot be removed while a paid pre-book is active.');
                            const oldDate = new Date(String(active[0].rtp_available_at_snapshot).replace(' ', 'T') + 'Z');
                            const newDate = new Date(rtpAvailableAt.replace(' ', 'T') + 'Z');
                            if (newDate > oldDate) throw new Error('A paid pre-book RTP date can only be moved earlier.');
                            await connection.query(`UPDATE prebookings SET rtp_available_at_snapshot=? WHERE prebook_id=?`, [rtpAvailableAt, active[0].prebook_id]);
                            dateChangeUserId = Number(active[0].user_id);
                        }
                    }
                    if (writeRtpFields) {
                        fields.push('rtp_status = ?', 'rtp_available_at = ?');
                        params.push(rtpStatus, rtpAvailableAt);
                    }
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
                    if (payload.rtp_status === 'NON_RTP') await connection.query(`DELETE FROM cart_items WHERE number_id=?`, [id]);
                }

                classification = numberValue !== String(current.number_value)
                    ? await syncNumberCategories(connection, id, numberValue)
                    : classifyNumber(numberValue);
                await connection.commit();
                if (dateChangeUserId) {
                    await pushNotification({ user_id: dateChangeUserId, type: 'order', title: 'RTP date moved earlier', message: `${displayNumber} will be ready sooner than originally scheduled.` });
                }
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
