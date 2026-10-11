import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { normalizeIndianNumber, decorateNumberCategories } from '../categories/categoryClassifier';

const ACTIVE_PREBOOK = "EXISTS (SELECT 1 FROM prebookings p WHERE p.number_id=n.number_id AND p.status IN ('PENDING_PAYMENT','BOOKED','READY','CANCEL_REQUESTED','REFUND_PENDING'))";
const HISTORY = "(EXISTS (SELECT 1 FROM order_items oi WHERE oi.number_id=n.number_id) OR EXISTS (SELECT 1 FROM prebookings p WHERE p.number_id=n.number_id) OR EXISTS (SELECT 1 FROM dealer_purchase_numbers d WHERE d.number_id=n.number_id))";
const marks = (values: any[]) => values.map(() => '?').join(',');

export function parseDeleteNumbers(input: unknown) {
  if (typeof input !== 'string' || input.length > 50000) throw new Error('Enter up to 1,000 numbers, separated by commas or new lines.');
  const entries = input.split(/[,\r\n]+/).map((item) => item.trim()).filter(Boolean);
  if (!entries.length || entries.length > 1000) throw new Error('Enter between 1 and 1,000 numbers.');
  const valid: string[] = [], invalid: { input: string; reason: string }[] = [], duplicates: string[] = [];
  for (const entry of entries) {
    try { const number = normalizeIndianNumber(entry); if (valid.includes(number)) duplicates.push(number); else valid.push(number); }
    catch (error: any) { invalid.push({ input: entry, reason: error.message }); }
  }
  return { entries, valid, invalid, duplicates };
}

export function analyseDeleteNumbers(parsed: ReturnType<typeof parseDeleteNumbers>, rows: any[], actor: number) {
  const found = new Map(rows.map((row) => [row.number_value, row]));
  const eligible: any[] = [], already_deleted: string[] = [], blocked: { number: string; reason: string }[] = [];
  for (const value of parsed.valid) {
    const row = found.get(value); if (!row) continue;
    if (row.deleted_at) already_deleted.push(value);
    else if (row.status === 'RESERVED' || Number(row.active_prebook)) blocked.push({ number: value, reason: 'An active order reservation or pre-book must be resolved first.' });
    else eligible.push({ number_id: row.number_id, number_value: row.number_value, display_number: row.display_number, status: row.status, mrp: row.mrp, offer_price: row.offer_price });
  }
  const not_found = parsed.valid.filter((value) => !found.has(value));
  const validation_token = createHash('sha256').update(JSON.stringify({ actor, input: parsed.entries, rows: rows.map((row) => [row.number_id, row.number_value, row.status, row.stock, row.deleted_at, row.updated_at, Number(row.active_prebook)]).sort((a, b) => Number(a[0]) - Number(b[0])) })).digest('hex');
  return { total: parsed.entries.length, unique_valid: parsed.valid.length, invalid: parsed.invalid, duplicates: parsed.duplicates, not_found, already_deleted, blocked, eligible, validation_token };
}

export class NumberRecycle {
  private dao = new MySqlClient('pixels');
  private master = new MasterModel();
  private failure(response: any, error: any) { response.status = -33; response.info = error.message || String(error); return response; }

  async validate(payload: any) {
    const response = this.master.getResponseModel();
    try {
      const parsed = parseDeleteNumbers(payload.numbers);
      const result: any = parsed.valid.length ? await this.dao.executeQuery(`SELECT n.*, ${ACTIVE_PREBOOK} AS active_prebook FROM vip_numbers n WHERE n.number_value IN (${marks(parsed.valid)})`, parsed.valid) : { status: 1, rows: [] };
      if (result.status !== 1) throw new Error(result.info || 'Could not validate numbers.');
      response.status = 1; response.info = 'Validation complete. Eligible numbers will be moved to Recycle; nothing is permanently deleted.';
      response.data = analyseDeleteNumbers(parsed, result.rows || [], Number(payload.user_id));
    } catch (error) { return this.failure(response, error); }
    return response;
  }

  private async audit(connection: any, row: any, action: string, userId: number) {
    await connection.query('INSERT INTO number_recycle_events (number_id,number_value,action,actor_id,snapshot) VALUES (?,?,?,?,?)', [row.number_id, row.number_value, action, userId, JSON.stringify(row)]);
  }

  private async moveRows(connection: any, rows: any[], userId: number) {
    for (const row of rows) {
      await this.audit(connection, row, 'RECYCLED', userId);
      await connection.query("UPDATE vip_numbers SET status_before_delete=status,stock_before_delete=stock,status='INACTIVE',stock=0,deleted_at=UTC_TIMESTAMP(),deleted_by=? WHERE number_id=? AND deleted_at IS NULL", [userId, row.number_id]);
      await connection.query('DELETE FROM cart_items WHERE number_id=?', [row.number_id]);
      await connection.query('DELETE FROM wishlist WHERE number_id=?', [row.number_id]);
    }
  }

  async softDelete(payload: any) {
    const response = this.master.getResponseModel(); let connection: any;
    try {
      if (payload.confirm !== true || !payload.validation_token) throw new Error('Validate the numbers and confirm moving them to Recycle.');
      const parsed = parseDeleteNumbers(payload.numbers); const userId = Number(payload.user_id);
      if (!parsed.valid.length) throw new Error('There are no valid numbers to recycle.');
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT n.*, ${ACTIVE_PREBOOK} AS active_prebook FROM vip_numbers n WHERE n.number_value IN (${marks(parsed.valid)}) ORDER BY n.number_id FOR UPDATE`, parsed.valid);
      const analysis = analyseDeleteNumbers(parsed, rows, userId);
      if (analysis.validation_token !== payload.validation_token) throw new Error('Inventory changed since validation. Validate again before deleting.');
      if (!analysis.eligible.length) throw new Error('There are no eligible numbers to recycle.');
      const eligibleIds = new Set(analysis.eligible.map((row) => row.number_id));
      await this.moveRows(connection, rows.filter((row: any) => eligibleIds.has(row.number_id)), userId);
      await connection.commit(); response.status = 1; response.info = `${eligibleIds.size} numbers moved to Recycle.`; response.data = { count: eligibleIds.size };
    } catch (error) { try { await connection?.rollback(); } catch {} return this.failure(response, error); }
    finally { connection?.release(); }
    return response;
  }

  // Existing seller deletion routes also recycle; hard deletion is available only in the admin recycle API.
  async removeById(payload: { number_id: number; owner_id?: number; user_id?: number }) {
    const response = this.master.getResponseModel(); let connection: any;
    try {
      const id = Number(payload.number_id); if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Select a number.');
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT n.*, ${ACTIVE_PREBOOK} AS active_prebook FROM vip_numbers n WHERE n.number_id=?${payload.owner_id ? ' AND n.seller_id=?' : ''} FOR UPDATE`, payload.owner_id ? [id, payload.owner_id] : [id]);
      const row = rows[0]; if (!row || row.deleted_at) throw new Error('Number not found in active inventory.');
      if (row.status === 'RESERVED' || Number(row.active_prebook)) throw new Error('Resolve the active order or pre-book before recycling this number.');
      await this.moveRows(connection, [row], Number(payload.user_id || payload.owner_id || row.seller_id));
      await connection.commit(); response.status = 1; response.info = 'Number moved to Recycle.'; response.data = { number_id: id };
    } catch (error) { try { await connection?.rollback(); } catch {} return this.failure(response, error); }
    finally { connection?.release(); }
    return response;
  }

  async list(payload: any) {
    const response = this.master.getResponseModel();
    try {
      const page = Math.max(1, Math.floor(Number(payload.page) || 1)); const limit = Math.min(1000, Math.max(1, Math.floor(Number(payload.limit) || 25)));
      const q = String(payload.q || '').trim().slice(0, 30); const where = 'n.deleted_at IS NOT NULL' + (q ? ' AND n.number_value LIKE ?' : ''); const params = q ? [`%${q}%`] : [];
      const count: any = await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM vip_numbers n WHERE ${where}`, params);
      const result: any = await this.dao.executeQuery(`SELECT n.*, ${HISTORY} AS has_history FROM vip_numbers n WHERE ${where} ORDER BY n.deleted_at DESC,n.number_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
      if (count.status !== 1 || result.status !== 1) throw new Error(count.info || result.info || 'Could not load Recycle.');
      response.status = 1; response.info = 'OK'; response.data = { items: (result.rows || []).map((row: any) => ({ ...decorateNumberCategories(row), can_permanently_delete: !Number(row.has_history), permanent_delete_reason: Number(row.has_history) ? 'Order, pre-book or dealer purchase history must be retained.' : null })), total: Number(count.rows?.[0]?.total || 0), page, limit };
    } catch (error) { return this.failure(response, error); }
    return response;
  }

  async change(payload: any, permanent = false) {
    const response = this.master.getResponseModel(); let connection: any;
    try {
      const supplied = payload.number_ids;
      if (!Array.isArray(supplied) || !supplied.length || supplied.length > 1000 || supplied.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw new Error('Select between 1 and 1,000 recycled numbers.');
      const ids = [...new Set<number>(supplied.map(Number))].sort((a, b) => a - b);
      if (permanent && payload.confirm !== true) throw new Error('Confirm permanent deletion from Recycle.');
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT n.*, ${HISTORY} AS has_history FROM vip_numbers n WHERE n.number_id IN (${marks(ids)}) ORDER BY n.number_id FOR UPDATE`, ids);
      if (rows.length !== ids.length || rows.some((row: any) => !row.deleted_at)) throw new Error('Selection changed. Refresh Recycle and select only recycled numbers.');
      if (permanent && rows.some((row: any) => Number(row.has_history))) throw new Error('Some selected numbers have order, pre-book or dealer purchase history. Deselect those numbers or restore them; their history cannot be erased.');
      for (const row of rows) {
        await this.audit(connection, row, permanent ? 'PERMANENTLY_DELETED' : 'RESTORED', Number(payload.user_id));
        if (permanent) {
          for (const table of ['cart_items','wishlist','reviews','homepage_premium_numbers','number_private_link_items','deal_of_day_numbers','corporate_pack_items','vip_number_categories','vip_number_subcategories']) await connection.query(`DELETE FROM ${table} WHERE number_id=?`, [row.number_id]);
          await connection.query('DELETE FROM vip_numbers WHERE number_id=? AND deleted_at IS NOT NULL', [row.number_id]);
        } else {
          await connection.query("UPDATE vip_numbers SET status=COALESCE(status_before_delete,'INACTIVE'),stock=COALESCE(stock_before_delete,0),deleted_at=NULL,deleted_by=NULL,status_before_delete=NULL,stock_before_delete=NULL WHERE number_id=? AND deleted_at IS NOT NULL", [row.number_id]);
        }
      }
      await connection.commit(); response.status = 1; response.info = `${ids.length} numbers ${permanent ? 'permanently deleted' : 'restored'}.`; response.data = { count: ids.length };
    } catch (error) { try { await connection?.rollback(); } catch {} return this.failure(response, error); }
    finally { connection?.release(); }
    return response;
  }
}
