import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';

const NUMBER_COLUMNS = `n.number_id,n.number_value,n.display_number,n.seller_id,n.seller_type,n.title_label,n.badge,
  n.mrp,n.offer_price,n.discount_pct,n.numerology_sum,n.operator,n.description,n.stock,n.status,
  n.visibility_type,n.rtp_status,n.rtp_available_at,n.is_featured,n.views,n.created_at`;

export class HomePremium {
  private dao = new MySqlClient('pixels');
  private master = new MasterModel();
  private response() { return this.master.getResponseModel(); }

  async list(admin = false) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(`SELECT ${NUMBER_COLUMNS},h.homepage_premium_id,h.sort_order,h.is_active AS homepage_active
        FROM homepage_premium_numbers h INNER JOIN vip_numbers n ON n.number_id=h.number_id
        ${admin ? '' : "WHERE h.is_active=1 AND n.deleted_at IS NULL AND n.status = 'AVAILABLE' AND n.stock>0 AND n.visibility_type='ONLINE'"}
        ORDER BY h.sort_order,h.homepage_premium_id`, []);
      res.status = 1;
      res.info = 'OK';
      res.data = (q.rows || []).map((row: any) => ({
        ...decorateNumberCategories(row),
        is_premium: Boolean(Number(row.is_featured)),
        homepage_active: Boolean(Number(row.homepage_active)),
      }));
    } catch (error) {
      res.status = -33;
      res.info = 'catch : ' + error;
    }
    return res;
  }

  async save(payload: any) {
    const res = this.response();
    try {
      const rowId = Number(payload.homepage_premium_id) || 0;
      const numberId = Number(payload.number_id);
      if (!numberId) throw new Error('Choose a catalog number.');
      if (rowId) {
        await this.dao.executeQuery(
          'UPDATE homepage_premium_numbers SET number_id=?,is_active=? WHERE homepage_premium_id=?',
          [numberId, payload.is_active === false ? 0 : 1, rowId],
        );
      } else {
        const q: any = await this.dao.executeQuery(
          'INSERT INTO homepage_premium_numbers (number_id,sort_order,is_active) SELECT ?,COALESCE(MAX(sort_order),-1)+1,? FROM homepage_premium_numbers',
          [numberId, payload.is_active === false ? 0 : 1],
        );
        payload.homepage_premium_id = Number(q.insertId);
      }
      res.status = 1;
      res.info = 'Homepage selection saved.';
      res.data = { homepage_premium_id: Number(payload.homepage_premium_id || rowId) };
    } catch (error) {
      res.status = -33;
      res.info = /duplicate/i.test(String(error))
        ? 'This number is already selected for the homepage.'
        : 'catch : ' + error;
    }
    return res;
  }

  async remove(payload: any) {
    const res = this.response();
    try {
      await this.dao.executeQuery(
        'DELETE FROM homepage_premium_numbers WHERE homepage_premium_id=?',
        [Number(payload.homepage_premium_id)],
      );
      res.status = 1;
      res.info = 'Homepage selection removed.';
    } catch (error) {
      res.status = -33;
      res.info = 'catch : ' + error;
    }
    return res;
  }

  async reorder(payload: any) {
    const res = this.response();
    let connection: any;
    try {
      const ids = Array.isArray(payload.homepage_premium_ids)
        ? payload.homepage_premium_ids.map(Number)
        : [];
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const [rows]: any = await connection.query('SELECT homepage_premium_id FROM homepage_premium_numbers FOR UPDATE');
      const actual = (rows || []).map((row: any) => Number(row.homepage_premium_id)).sort();
      if (actual.join(',') !== [...ids].sort((a, b) => a - b).join(',')) {
        throw new Error('Homepage ordering is stale.');
      }
      for (let index = 0; index < ids.length; index += 1) {
        await connection.query(
          'UPDATE homepage_premium_numbers SET sort_order=? WHERE homepage_premium_id=?',
          [index, ids[index]],
        );
      }
      await connection.commit();
      res.status = 1;
      res.info = 'Homepage order updated.';
    } catch (error) {
      try { await connection?.rollback(); } catch { /* best effort */ }
      res.status = -33;
      res.info = 'catch : ' + error;
    } finally {
      connection?.release();
    }
    return res;
  }
}
