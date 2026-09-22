import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';

const NUMBER_COLUMNS = `n.number_id, n.number_value, n.display_number,
    n.seller_id, n.seller_type, n.title_label, n.badge, n.mrp, n.offer_price, n.discount_pct,
    n.numerology_sum, n.operator, n.description, n.stock, n.status,n.visibility_type,n.rtp_status,n.rtp_available_at,
    n.is_featured, n.views, n.created_at`;

const cleanOptionalText = (value: unknown, maxLength: number): string | null => {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, maxLength) : null;
};

const activeFlag = (value: unknown): number => (
    value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false' ? 0 : 1
);

export class DealsOfDay {
    private dao = new MySqlClient('pixels');
    private logger = new Logger();
    private masterModel = new MasterModel();

    private response() {
        return this.masterModel.getResponseModel();
    }

    private decorate(rows: any[], source: 'CURATED' | 'FEATURED_FALLBACK') {
        return rows.map((row: any, index: number) => ({
            ...decorateNumberCategories(row),
            is_premium: Boolean(Number(row.is_featured)),
            deal_id: row.deal_id == null ? null : Number(row.deal_id),
            sort_order: row.sort_order == null ? index : Number(row.sort_order),
            is_active: row.is_active == null ? true : Boolean(Number(row.is_active)),
            source,
        }));
    }

    /** Public hero feed. Curated rows win; catalog fallbacks keep the hero populated. */
    async publicList() {
        const resModel = this.response();
        try {
            const curated: any = await this.dao.executeQuery(
                `SELECT d.deal_id, d.hero_label, d.hero_description, d.sort_order, d.is_active,
                        ${NUMBER_COLUMNS}
                 FROM deal_of_day_numbers d
                 INNER JOIN vip_numbers n ON n.number_id = d.number_id
                 WHERE d.is_active = 1 AND n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE'
                 ORDER BY d.sort_order ASC, d.deal_id ASC`,
                [],
            );
            if (curated.status !== 1) throw new Error(curated.info || 'Unable to load Lucky Pick of the Day.');

            if ((curated.rows || []).length) {
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { items: this.decorate(curated.rows || [], 'CURATED'), source: 'CURATED' };
                return resModel;
            }

            let fallback: any = await this.dao.executeQuery(
                `SELECT NULL AS deal_id, NULL AS hero_label, NULL AS hero_description,
                        NULL AS sort_order, 1 AS is_active, ${NUMBER_COLUMNS}
                 FROM vip_numbers n
                 WHERE n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE' AND n.is_featured = 1
                 ORDER BY n.views DESC, n.created_at DESC
                 LIMIT 8`,
                [],
            );
            if (fallback.status !== 1) throw new Error(fallback.info || 'Unable to load featured Lucky Pick of the Day numbers.');

            if (!(fallback.rows || []).length) {
                fallback = await this.dao.executeQuery(
                    `SELECT NULL AS deal_id, NULL AS hero_label, NULL AS hero_description,
                            NULL AS sort_order, 1 AS is_active, ${NUMBER_COLUMNS}
                     FROM vip_numbers n
                     WHERE n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE'
                     ORDER BY n.created_at DESC
                     LIMIT 8`,
                    [],
                );
                if (fallback.status !== 1) throw new Error(fallback.info || 'Unable to load fallback Lucky Pick of the Day numbers.');
            }

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                items: this.decorate(fallback.rows || [], 'FEATURED_FALLBACK'),
                source: 'FEATURED_FALLBACK',
            };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        }
        return resModel;
    }

    /** Admin view includes inactive and unavailable catalog rows for maintenance. */
    async adminList() {
        const resModel = this.response();
        try {
            const query: any = await this.dao.executeQuery(
                `SELECT d.deal_id, d.hero_label, d.hero_description, d.sort_order, d.is_active,
                        d.updated_at, ${NUMBER_COLUMNS}
                 FROM deal_of_day_numbers d
                 INNER JOIN vip_numbers n ON n.number_id = d.number_id
                 ORDER BY d.sort_order ASC, d.deal_id ASC`,
                [],
            );
            if (query.status !== 1) throw new Error(query.info || 'Unable to load Lucky Pick of the Day master.');
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = this.decorate(query.rows || [], 'CURATED');
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    async save(payload: any) {
        const resModel = this.response();
        try {
            const dealId = Number(payload.deal_id) || 0;
            const numberId = Number(payload.number_id) || 0;
            if (!numberId) throw new Error('Please select a VIP number.');

            const numberQuery: any = await this.dao.executeQuery(
                'SELECT number_id FROM vip_numbers WHERE number_id = ? LIMIT 1',
                [numberId],
            );
            if (numberQuery.status !== 1 || !(numberQuery.rows || []).length) {
                throw new Error('The selected VIP number no longer exists.');
            }

            const duplicate: any = await this.dao.executeQuery(
                'SELECT deal_id FROM deal_of_day_numbers WHERE number_id = ? AND deal_id <> ? LIMIT 1',
                [numberId, dealId],
            );
            if (duplicate.status !== 1) throw new Error(duplicate.info || 'Unable to validate this Lucky Pick.');
            if ((duplicate.rows || []).length) throw new Error('This number is already in Lucky Pick of the Day.');

            const heroLabel = cleanOptionalText(payload.hero_label, 64);
            const heroDescription = cleanOptionalText(payload.hero_description, 160);
            const isActive = activeFlag(payload.is_active);

            if (dealId) {
                const update: any = await this.dao.executeQuery(
                    `UPDATE deal_of_day_numbers
                     SET number_id = ?, hero_label = ?, hero_description = ?, is_active = ?
                     WHERE deal_id = ?`,
                    [numberId, heroLabel, heroDescription, isActive, dealId],
                );
                if (update.status !== 1 || update.affectedRows === 0) throw new Error('Lucky Pick of the Day entry not found.');
                resModel.data = { deal_id: dealId };
            } else {
                const insert: any = await this.dao.executeQuery(
                    `INSERT INTO deal_of_day_numbers
                        (number_id, hero_label, hero_description, sort_order, is_active)
                     SELECT ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ?
                     FROM deal_of_day_numbers`,
                    [numberId, heroLabel, heroDescription, isActive],
                );
                if (insert.status !== 1 || !insert.insertId) throw new Error(insert.info || 'Unable to add Lucky Pick of the Day entry.');
                resModel.data = { deal_id: Number(insert.insertId) };
            }

            resModel.status = 1;
            resModel.info = 'Lucky Pick of the Day entry saved.';
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        }
        return resModel;
    }

    async reorder(payload: any) {
        const resModel = this.response();
        const dealIds = Array.isArray(payload.deal_ids)
            ? payload.deal_ids.map((value: unknown) => Number(value)).filter((value: number) => value > 0)
            : [];
        const uniqueIds = Array.from(new Set(dealIds));
        let connection: any;
        try {
            if (uniqueIds.length !== dealIds.length) throw new Error('Lucky Pick ordering contains duplicate entries.');
            connection = await this.dao.getConnection();
            await connection.beginTransaction();
            const [rows]: any = await connection.query(
                'SELECT deal_id FROM deal_of_day_numbers ORDER BY sort_order ASC, deal_id ASC FOR UPDATE',
            );
            const existingIds = (rows || []).map((row: any) => Number(row.deal_id));
            if (
                existingIds.length !== uniqueIds.length
                || existingIds.some((id: number) => !uniqueIds.includes(id))
            ) {
                throw new Error('Lucky Pick ordering is stale. Refresh the list and try again.');
            }

            for (let index = 0; index < uniqueIds.length; index += 1) {
                await connection.query(
                    'UPDATE deal_of_day_numbers SET sort_order = ? WHERE deal_id = ?',
                    [index, uniqueIds[index]],
                );
            }
            await connection.commit();
            resModel.status = 1;
            resModel.info = 'Lucky Pick of the Day order updated.';
            resModel.data = { deal_ids: uniqueIds };
        } catch (error) {
            if (connection) {
                try { await connection.rollback(); } catch { /* best effort */ }
            }
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        } finally {
            if (connection) connection.release();
        }
        return resModel;
    }

    async remove(payload: any) {
        const resModel = this.response();
        try {
            const dealId = Number(payload.deal_id) || 0;
            if (!dealId) throw new Error('deal_id is required.');
            const query: any = await this.dao.executeQuery(
                'DELETE FROM deal_of_day_numbers WHERE deal_id = ?',
                [dealId],
            );
            if (query.status !== 1 || query.affectedRows === 0) throw new Error('Lucky Pick of the Day entry not found.');
            resModel.status = 1;
            resModel.info = 'Lucky Pick of the Day entry removed.';
            resModel.data = {};
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
