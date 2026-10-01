import crypto from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';

export const hashPrivateToken = (token: string) => crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
export const generatePrivateToken = () => crypto.randomBytes(32).toString('base64url');
export const OFFLINE_CATALOG_NAME = 'Offline catalog';

export async function resolvePrivateLinkWithConnection(connection: any, token: string, numberId?: number) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const [rows]: any = await connection.query(
        `SELECT private_link_id, name, expires_at FROM number_private_links
         WHERE name=? AND token_hash=? AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`,
        [OFFLINE_CATALOG_NAME, hashPrivateToken(raw)],
    );
    return rows?.[0] || null;
}

export class PrivateLinks {
    private dao = new MySqlClient('pixels');
    private masterModel = new MasterModel();

    private response() { return this.masterModel.getResponseModel(); }

    async resolve(payload: { token: string; page?: number; limit?: number; q?: string }) {
        const response = this.response();
        let connection: any;
        try {
            connection = await this.dao.getConnection();
            try {
                const link = await resolvePrivateLinkWithConnection(connection, payload.token);
                if (!link) throw new Error('This Offline catalog link is invalid, expired, or revoked.');
                const page = Math.max(1, Math.floor(Number(payload.page) || 1));
                const limit = Math.min(60, Math.max(1, Math.floor(Number(payload.limit) || 24)));
                const search = String(payload.q || '').replace(/\D/g, '').slice(0, 10);
                const where = "n.status='AVAILABLE' AND n.stock>0" + (search ? ' AND n.number_value LIKE ?' : '');
                const params = search ? [`%${search}%`] : [];
                const [count]: any = await connection.query(`SELECT COUNT(*) AS total FROM vip_numbers n WHERE ${where}`, params);
                const [rows]: any = await connection.query(
                    `SELECT n.number_id,n.number_value,n.display_number,n.title_label,n.badge,n.mrp,n.offer_price,
                            n.discount_pct,n.numerology_sum,n.operator,n.description,n.stock,n.status,n.visibility_type,
                            n.rtp_status,n.rtp_available_at,n.is_featured,n.views,n.created_at
                     FROM vip_numbers n WHERE ${where}
                     ORDER BY n.created_at DESC,n.number_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit],
                );
                response.status = 1; response.info = 'OK';
                response.data = {
                    collection: { private_link_id: Number(link.private_link_id), name: link.name, expires_at: link.expires_at },
                    items: (rows || []).map((row: any) => ({
                        ...decorateNumberCategories(row),
                        activation_type: row.rtp_status,
                        is_premium: Boolean(Number(row.is_featured)),
                    })),
                    total: Number(count?.[0]?.total || 0), page, limit,
                };
            } finally { connection.release(); connection = null; }
        } catch (error) { response.status = -33; response.info = error instanceof Error ? error.message : String(error); }
        return response;
    }

    async list(payload: { page?: number, limit?: number } = {}) {
        const response = this.response();
        try {
            const page = Math.max(1, Math.floor(Number(payload.page) || 1));
            const limit = Math.min(50, Math.max(1, Math.floor(Number(payload.limit) || 20)));
            const offset = (page - 1) * limit;
            const count: any = await this.dao.executeQuery('SELECT COUNT(*) AS total FROM number_private_links WHERE name=?', [OFFLINE_CATALOG_NAME]);
            const q: any = await this.dao.executeQuery(
                `SELECT private_link_id,name,expires_at,revoked_at,created_at,updated_at
                 FROM number_private_links WHERE name=? ORDER BY created_at DESC, private_link_id DESC LIMIT ? OFFSET ?`,
                [OFFLINE_CATALOG_NAME, limit, offset],
            );
            if (q.status !== 1) throw new Error(q.info);
            const items = (q.rows || []).map((row: any) => ({
                ...row,
                number_ids: [],
            }));
            response.status = 1; response.info = 'OK'; response.data = { items, total: Number(count.rows?.[0]?.total || 0), page, limit };
        } catch (error) { response.status = -33; response.info = String(error); }
        return response;
    }

    async create(payload: any) {
        const response = this.response();
        try {
            const existing: any = await this.dao.executeQuery('SELECT private_link_id FROM number_private_links WHERE name=? LIMIT 1', [OFFLINE_CATALOG_NAME]);
            if (existing.status !== 1) throw new Error(existing.info);
            if (existing.rows?.length) throw new Error('The generic Offline catalog link already exists. Rotate it to get a new URL.');
            const token = generatePrivateToken();
            const insert: any = await this.dao.executeQuery(
                'INSERT INTO number_private_links (name,token_hash,expires_at,created_by) VALUES (?,?,NULL,?)',
                [OFFLINE_CATALOG_NAME, hashPrivateToken(token), Number(payload.user_id)],
            );
            if (insert.status !== 1 || !insert.insertId) throw new Error(insert.info || 'Could not create link.');
            response.status = 1; response.info = 'Offline catalog link created.';
            response.data = { private_link_id: Number(insert.insertId), token };
        } catch (error) { response.status = -33; response.info = String(error); }
        return response;
    }

    async update(payload: any) {
        const response = this.response(); let connection: any;
        try {
            const id = Number(payload.private_link_id);
            if (!id) throw new Error('private_link_id is required.');
            if (Array.isArray(payload.number_ids) || payload.name && payload.name !== OFFLINE_CATALOG_NAME) {
                throw new Error('The generic link always includes all available Online and Offline numbers.');
            }
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const [links]: any = await connection.query('SELECT * FROM number_private_links WHERE private_link_id=? AND name=? FOR UPDATE', [id, OFFLINE_CATALOG_NAME]);
            if (!links?.length) throw new Error('Private collection not found.');
            const fields: string[] = []; const params: any[] = [];
            if (payload.name !== undefined) {
                const name = String(payload.name).trim(); if (name.length < 3) throw new Error('Collection name is too short.');
                fields.push('name=?'); params.push(name);
            }
            if (payload.expires_at !== undefined) {
                if (payload.expires_at && new Date(String(payload.expires_at)) <= new Date()) throw new Error('Expiry must be in the future.');
                fields.push('expires_at=?'); params.push(payload.expires_at || null);
            }
            if (fields.length) await connection.query(`UPDATE number_private_links SET ${fields.join(',')} WHERE private_link_id=?`, [...params, id]);
            await connection.commit(); response.status = 1; response.info = 'Offline catalog link updated.'; response.data = { private_link_id: id };
        } catch (error) { try { await connection?.rollback(); } catch {} response.status = -33; response.info = String(error); }
        finally { connection?.release(); }
        return response;
    }

    async rotate(payload: any) {
        const response = this.response();
        try {
            const id = Number(payload.private_link_id); const token = generatePrivateToken();
            const q: any = await this.dao.executeQuery(
                'UPDATE number_private_links SET token_hash=?,revoked_at=NULL,expires_at=NULL WHERE private_link_id=? AND name=?', [hashPrivateToken(token), id, OFFLINE_CATALOG_NAME],
            );
            if (q.status !== 1 || !q.affectedRows) throw new Error('Private collection not found.');
            response.status = 1; response.info = 'Private link rotated.'; response.data = { private_link_id: id, token };
        } catch (error) { response.status = -33; response.info = String(error); }
        return response;
    }

    async revoke(payload: any) {
        const response = this.response();
        const q: any = await this.dao.executeQuery('UPDATE number_private_links SET revoked_at=UTC_TIMESTAMP() WHERE private_link_id=? AND name=? AND revoked_at IS NULL', [Number(payload.private_link_id), OFFLINE_CATALOG_NAME]);
        response.status = q.status === 1 && q.affectedRows ? 1 : -33;
        response.info = response.status === 1 ? 'Private link revoked.' : 'Private collection not found or already revoked.';
        return response;
    }
}
