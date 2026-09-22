import crypto from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';

export const hashPrivateToken = (token: string) => crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
export const generatePrivateToken = () => crypto.randomBytes(32).toString('base64url');

export async function resolvePrivateLinkWithConnection(connection: any, token: string, numberId?: number) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const params: any[] = [hashPrivateToken(raw)];
    let numberJoin = '';
    if (numberId) {
        numberJoin = ' JOIN number_private_link_items pli ON pli.private_link_id = pl.private_link_id AND pli.number_id = ?';
        params.push(Number(numberId));
    }
    const [rows]: any = await connection.query(
        `SELECT pl.private_link_id, pl.name, pl.expires_at
         FROM number_private_links pl${numberJoin}
         WHERE pl.token_hash = ? AND pl.revoked_at IS NULL
           AND (pl.expires_at IS NULL OR pl.expires_at > UTC_TIMESTAMP()) LIMIT 1`,
        numberId ? [Number(numberId), hashPrivateToken(raw)] : [hashPrivateToken(raw)],
    );
    return rows?.[0] || null;
}

export class PrivateLinks {
    private dao = new MySqlClient('pixels');
    private masterModel = new MasterModel();

    private response() { return this.masterModel.getResponseModel(); }

    async resolve(payload: { token: string }) {
        const response = this.response();
        try {
            const connection = await this.dao.getConnection();
            try {
                const link = await resolvePrivateLinkWithConnection(connection, payload.token);
                if (!link) throw new Error('This private collection link is invalid, expired, or revoked.');
                const [rows]: any = await connection.query(
                    `SELECT n.number_id,n.number_value,n.display_number,n.title_label,n.badge,n.mrp,n.offer_price,
                            n.discount_pct,n.numerology_sum,n.operator,n.description,n.stock,n.status,n.visibility_type,
                            n.rtp_status,n.rtp_available_at,n.is_featured,n.views,n.created_at
                     FROM number_private_link_items pli
                     JOIN vip_numbers n ON n.number_id=pli.number_id
                     WHERE pli.private_link_id=? AND n.visibility_type='OFFLINE' AND n.status='AVAILABLE' AND n.stock>0
                     ORDER BY n.created_at DESC`, [link.private_link_id],
                );
                response.status = 1; response.info = 'OK';
                response.data = {
                    collection: { private_link_id: Number(link.private_link_id), name: link.name, expires_at: link.expires_at },
                    items: (rows || []).map((row: any) => ({
                        ...decorateNumberCategories(row),
                        activation_type: row.rtp_status,
                        is_premium: Boolean(Number(row.is_featured)),
                    })),
                };
            } finally { connection.release(); }
        } catch (error) { response.status = -33; response.info = error instanceof Error ? error.message : String(error); }
        return response;
    }

    async list() {
        const response = this.response();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT pl.private_link_id,pl.name,pl.expires_at,pl.revoked_at,pl.created_at,pl.updated_at,
                        COUNT(pli.number_id) AS assigned_count,GROUP_CONCAT(pli.number_id ORDER BY pli.number_id) AS number_ids
                 FROM number_private_links pl LEFT JOIN number_private_link_items pli ON pli.private_link_id=pl.private_link_id
                 GROUP BY pl.private_link_id ORDER BY pl.created_at DESC`, [],
            );
            if (q.status !== 1) throw new Error(q.info);
            response.status = 1; response.info = 'OK'; response.data = (q.rows || []).map((row: any) => ({
                ...row,
                number_ids: row.number_ids ? String(row.number_ids).split(',').map(Number) : [],
            }));
        } catch (error) { response.status = -33; response.info = String(error); }
        return response;
    }

    async create(payload: any) {
        const response = this.response(); let connection: any;
        try {
            const name = String(payload.name || '').trim();
            if (name.length < 3 || name.length > 120) throw new Error('Collection name must be 3 to 120 characters.');
            const expiresAt = payload.expires_at ? String(payload.expires_at) : null;
            if (expiresAt && new Date(expiresAt) <= new Date()) throw new Error('Expiry must be in the future.');
            const ids = Array.from(new Set((payload.number_ids || []).map(Number).filter((id: number) => id > 0))) as number[];
            const token = generatePrivateToken();
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const [insert]: any = await connection.query(
                'INSERT INTO number_private_links (name,token_hash,expires_at,created_by) VALUES (?,?,?,?)',
                [name, hashPrivateToken(token), expiresAt, Number(payload.user_id)],
            );
            if (ids.length) await this.replaceItems(connection, Number(insert.insertId), ids);
            await connection.commit();
            response.status = 1; response.info = 'Private collection created.';
            response.data = { private_link_id: Number(insert.insertId), token };
        } catch (error) { try { await connection?.rollback(); } catch {} response.status = -33; response.info = String(error); }
        finally { connection?.release(); }
        return response;
    }

    private async replaceItems(connection: any, linkId: number, ids: number[]) {
        if (ids.length) {
            const [numbers]: any = await connection.query(
                `SELECT number_id,visibility_type FROM vip_numbers WHERE number_id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, ids,
            );
            if ((numbers || []).length !== ids.length) throw new Error('One or more selected numbers do not exist.');
            if (numbers.some((n: any) => n.visibility_type !== 'OFFLINE')) throw new Error('Private collections can only contain Offline numbers.');
        }
        await connection.query('DELETE FROM number_private_link_items WHERE private_link_id=?', [linkId]);
        for (const id of ids) await connection.query('INSERT INTO number_private_link_items (private_link_id,number_id) VALUES (?,?)', [linkId, id]);
    }

    async update(payload: any) {
        const response = this.response(); let connection: any;
        try {
            const id = Number(payload.private_link_id);
            if (!id) throw new Error('private_link_id is required.');
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const [links]: any = await connection.query('SELECT * FROM number_private_links WHERE private_link_id=? FOR UPDATE', [id]);
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
            if (Array.isArray(payload.number_ids)) {
                const ids = Array.from(new Set(payload.number_ids.map(Number).filter((n: number) => n > 0))) as number[];
                await this.replaceItems(connection, id, ids);
            }
            await connection.commit(); response.status = 1; response.info = 'Private collection updated.'; response.data = { private_link_id: id };
        } catch (error) { try { await connection?.rollback(); } catch {} response.status = -33; response.info = String(error); }
        finally { connection?.release(); }
        return response;
    }

    async rotate(payload: any) {
        const response = this.response();
        try {
            const id = Number(payload.private_link_id); const token = generatePrivateToken();
            const q: any = await this.dao.executeQuery(
                'UPDATE number_private_links SET token_hash=?,revoked_at=NULL WHERE private_link_id=?', [hashPrivateToken(token), id],
            );
            if (q.status !== 1 || !q.affectedRows) throw new Error('Private collection not found.');
            response.status = 1; response.info = 'Private link rotated.'; response.data = { private_link_id: id, token };
        } catch (error) { response.status = -33; response.info = String(error); }
        return response;
    }

    async revoke(payload: any) {
        const response = this.response();
        const q: any = await this.dao.executeQuery('UPDATE number_private_links SET revoked_at=UTC_TIMESTAMP() WHERE private_link_id=? AND revoked_at IS NULL', [Number(payload.private_link_id)]);
        response.status = q.status === 1 && q.affectedRows ? 1 : -33;
        response.info = response.status === 1 ? 'Private link revoked.' : 'Private collection not found or already revoked.';
        return response;
    }
}
