import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';

export class ReviewScreenshots {
    private dao = new MySqlClient('pixels');
    private master = new MasterModel();
    private response() { return this.master.getResponseModel(); }

    async list(all = false) {
        const result = this.response();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT screenshot_id,alt_text,sort_order,is_active,created_at FROM review_screenshots ${all ? '' : 'WHERE is_active=1'} ORDER BY sort_order,screenshot_id`, []);
            if (q.status !== 1) throw new Error(q.info);
            result.status = 1; result.info = 'OK'; result.data = q.rows || [];
        } catch (error) { result.status = -33; result.info = String(error); }
        return result;
    }

    async upload(payload: any, file: any) {
        const result = this.response();
        try {
            if (!file || Array.isArray(file) || !Buffer.isBuffer(file.data)) throw new Error('Choose a review screenshot.');
            const mime = String(file.mimetype || '').toLowerCase();
            const bytes: Buffer = file.data;
            const valid = mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
                || mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
                || mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
            if (!valid) throw new Error('Upload a genuine PNG, JPEG, or WebP image.');
            if (bytes.length > 3 * 1024 * 1024) throw new Error('Screenshot must be 3 MB or smaller.');
            const width = Number(payload.width); const height = Number(payload.height);
            if (!Number.isFinite(width) || !Number.isFinite(height) || height < 1 || width / height < 1.2 || width / height > 2.5) throw new Error('Use a landscape review screenshot.');
            const hash = createHash('sha256').update(bytes).digest('hex');
            const q: any = await this.dao.executeQuery(
                `INSERT INTO review_screenshots (alt_text,image_mime,image_sha256,image_data,sort_order,is_active)
                 SELECT ?,?,?,?,COALESCE(MAX(sort_order),-1)+1,1 FROM review_screenshots`,
                [String(payload.alt_text || 'Google review screenshot').slice(0, 180), mime, hash, bytes]);
            if (q.status !== 1) throw new Error(q.info);
            result.status = 1; result.info = 'Screenshot added.'; result.data = { screenshot_id: Number(q.insertId) };
        } catch (error) { result.status = -33; result.info = String(error); }
        return result;
    }

    async save(payload: any) {
        const result = this.response();
        try {
            const q: any = await this.dao.executeQuery('UPDATE review_screenshots SET alt_text=?,is_active=? WHERE screenshot_id=?',
                [String(payload.alt_text || 'Google review screenshot').slice(0, 180), payload.is_active ? 1 : 0, Number(payload.screenshot_id)]);
            if (q.status !== 1 || !q.affectedRows) throw new Error('Review screenshot not found.');
            result.status = 1; result.info = 'Saved.';
        } catch (error) { result.status = -33; result.info = String(error); }
        return result;
    }

    async reorder(payload: any) {
        const result = this.response();
        try {
            const ids = Array.isArray(payload.screenshot_ids) ? payload.screenshot_ids.map(Number) : [];
            if (!ids.length || new Set(ids).size !== ids.length) throw new Error('A unique order is required.');
            for (let index = 0; index < ids.length; index++) {
                const q: any = await this.dao.executeQuery('UPDATE review_screenshots SET sort_order=? WHERE screenshot_id=?', [index, ids[index]]);
                if (q.status !== 1 || !q.affectedRows) throw new Error('Review screenshot not found.');
            }
            result.status = 1; result.info = 'Order saved.';
        } catch (error) { result.status = -33; result.info = String(error); }
        return result;
    }

    async remove(payload: any) {
        const result = this.response();
        try {
            const q: any = await this.dao.executeQuery('DELETE FROM review_screenshots WHERE screenshot_id=?', [Number(payload.screenshot_id)]);
            if (q.status !== 1 || !q.affectedRows) throw new Error('Review screenshot not found.');
            result.status = 1; result.info = 'Deleted.';
        } catch (error) { result.status = -33; result.info = String(error); }
        return result;
    }

    async image(id: number) {
        const q: any = await this.dao.executeQuery('SELECT image_mime,image_sha256,image_data FROM review_screenshots WHERE screenshot_id=? AND is_active=1 LIMIT 1', [id]);
        return q.status === 1 ? q.rows?.[0] || null : null;
    }
}
