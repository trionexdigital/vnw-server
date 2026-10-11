import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';
import { creditWallet } from '../wallet/wallet';
import { CATEGORY_CLASSIFIER_VERSION, decorateNumberCategories, getCategoryBySlug, getSubcategoryForCategory } from '../categories/categoryClassifier';
import { resolvePrivateLinkWithConnection } from '../privateLinks/privateLinks';
import { loadBilling } from '../orders/billing';
import { assertCheckoutSchema, PaymentHistory, safePaymentData } from '../payments/paymentHistory';

import { CashfreeClient, CashfreeError, PaymentHoldError, cashfreeMode, amountInPaise, utcDate } from '../payments/cashfree';

// Cashfree requires order expiry strictly more than 15 minutes after creation.
const HOLD_MINUTES = 20;
const CANCELLATION_HOURS = 48;
const ACTIVE_STATES = ['PENDING_PAYMENT', 'BOOKED', 'READY', 'CANCEL_REQUESTED', 'REFUND_PENDING'];
const ISSUE_REASONS = ['DELIVERY_ISSUE', 'UPC_ISSUE', 'ACTIVATION_ISSUE'];

const sqlUtc = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

export function istDateToUtc(value: unknown): string {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid RTP availability date.');
  const parsed = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Choose a valid RTP availability date.');
  return sqlUtc(parsed);
}

export function isCancellationEligible(deadline: unknown, now = new Date()): boolean {
  if (!deadline) return false;
  const raw = String(deadline);
  const parsed = new Date(raw.includes('T') || raw.endsWith('Z') ? raw : `${raw.replace(' ', 'T')}Z`);
  return !Number.isNaN(parsed.getTime()) && now.getTime() <= parsed.getTime();
}

export class Prebooks {
  private dao = new MySqlClient('pixels');
  private masterModel = new MasterModel();
  private response() { return this.masterModel.getResponseModel(); }

  async reconcile(): Promise<void> {
    // Release abandoned, unpaid holds. Conditional updates keep this safe across processes.
    const expired: any = await this.dao.executeQuery(
      `SELECT prebook_id, order_id, number_id FROM prebookings
       WHERE status='PENDING_PAYMENT' AND hold_expires_at <= UTC_TIMESTAMP() LIMIT 200`, [],
    );
    for (const row of (expired.rows || [])) {
      let connection: any;
      try {
        connection = await this.dao.getConnection();
        await connection.beginTransaction();
        const [locked]: any = await connection.query(
          `SELECT status FROM prebookings WHERE prebook_id=? FOR UPDATE`, [row.prebook_id],
        );
        if (locked?.[0]?.status === 'PENDING_PAYMENT') {
          await connection.query(`UPDATE prebookings SET status='FAILED' WHERE prebook_id=?`, [row.prebook_id]);
          await connection.query(`UPDATE orders SET status='CANCELLED', payment_status='FAILED' WHERE order_id=? AND payment_status='UNPAID'`, [row.order_id]);
          await connection.query(`UPDATE order_items SET item_status='CANCELLED' WHERE order_id=?`, [row.order_id]);
          await connection.query(`UPDATE vip_numbers SET status='AVAILABLE' WHERE number_id=? AND status='RESERVED'`, [row.number_id]);
          await new PaymentHistory(this.dao).event({ order_id: row.order_id }, 'HOLD_EXPIRED', 'FAILED', {}, 'SERVER', connection, `expired:${row.order_id}`);
        }
        await connection.commit();
      } catch (error) {
        if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
      } finally { if (connection) connection.release(); }
    }

    // All due inventory becomes RTP. Availability/sale state remains independent.
    await this.dao.executeQuery(
      `UPDATE vip_numbers SET rtp_status='RTP'
       WHERE rtp_status='NON_RTP' AND rtp_available_at IS NOT NULL AND rtp_available_at <= UTC_TIMESTAMP()`, [],
    );

    const ready: any = await this.dao.executeQuery(
      `SELECT p.prebook_id, p.order_id, p.user_id, p.number_id, n.display_number
       FROM prebookings p INNER JOIN vip_numbers n ON n.number_id=p.number_id
       WHERE p.status='BOOKED' AND p.rtp_available_at_snapshot <= UTC_TIMESTAMP() LIMIT 200`, [],
    );
    for (const row of (ready.rows || [])) {
      const changed: any = await this.dao.executeQuery(
        `UPDATE prebookings SET status='READY' WHERE prebook_id=? AND status='BOOKED'`, [row.prebook_id],
      );
      if (changed.affectedRows) {
        await this.dao.executeQuery(`UPDATE orders SET status='PROCESSING' WHERE order_id=? AND payment_status='PAID'`, [row.order_id]);
        await pushNotification({
          user_id: row.user_id, type: 'order', title: 'Your pre-book is ready to port',
          message: `${row.display_number} is now RTP and ready for fulfilment.`,
        });
      }
    }
  }

  async catalog(payload: any) {
    const res = this.response();
    try {
      await this.reconcile();
      const where: string[] = ["n.deleted_at IS NULL", "n.status='AVAILABLE'", 'n.stock > 0', "n.rtp_status='NON_RTP'", "n.visibility_type='ONLINE'", 'n.rtp_available_at > UTC_TIMESTAMP()'];
      const params: any[] = [];
      const q = String(payload.q || '').replace(/\D/g, '').slice(0, 10);
      if (q) { where.push('(n.number_value LIKE ? OR n.display_number LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
      if (payload.operator) { where.push('n.operator=?'); params.push(String(payload.operator).slice(0, 32)); }
      if (payload.price_min !== undefined && payload.price_min !== '') { where.push('n.offer_price>=?'); params.push(Number(payload.price_min)); }
      if (payload.price_max !== undefined && payload.price_max !== '') { where.push('n.offer_price<=?'); params.push(Number(payload.price_max)); }
      if (payload.rtp_from) { where.push('n.rtp_available_at>=?'); params.push(istDateToUtc(payload.rtp_from)); }
      if (payload.rtp_to) {
        const end = new Date(istDateToUtc(payload.rtp_to).replace(' ', 'T') + 'Z');
        end.setUTCDate(end.getUTCDate() + 1);
        where.push('n.rtp_available_at<?'); params.push(sqlUtc(end));
      }
      if (payload.category) {
        const category = getCategoryBySlug(payload.category);
        if (!category) throw new Error('Unknown category.');
        if (payload.subcategory_id !== undefined && payload.subcategory_id !== null && payload.subcategory_id !== '') {
          const subcategoryId = Number(payload.subcategory_id);
          if (!Number.isSafeInteger(subcategoryId) || !getSubcategoryForCategory(category.slug, subcategoryId)) throw new Error('Unknown subcategory.');
          where.push('EXISTS (SELECT 1 FROM vip_number_subcategories vns WHERE vns.number_id=n.number_id AND vns.category_id=? AND vns.subcategory_id=? AND vns.classifier_version=?)');
          params.push(category.id, subcategoryId, CATEGORY_CLASSIFIER_VERSION);
        } else {
          where.push('EXISTS (SELECT 1 FROM vip_number_categories vnc WHERE vnc.number_id=n.number_id AND vnc.category_slug=? AND vnc.classifier_version=?)');
          params.push(category.slug, CATEGORY_CLASSIFIER_VERSION);
        }
      } else if (payload.subcategory_id !== undefined && payload.subcategory_id !== null && payload.subcategory_id !== '') {
        throw new Error('Select a category before its subcategory.');
      }
      const page = Math.max(1, Number(payload.page) || 1);
      const limit = Math.min(60, Math.max(1, Number(payload.limit) || 20));
      const sortMap: Record<string, string> = {
        newest: 'n.created_at DESC', price_asc: 'n.offer_price ASC', price_desc: 'n.offer_price DESC',
        rtp_soon: 'n.rtp_available_at ASC', rtp_late: 'n.rtp_available_at DESC', popular: 'n.views DESC',
      };
      const order = sortMap[String(payload.sort || 'rtp_soon')] || sortMap.rtp_soon;
      const columns = `n.number_id,n.number_value,n.display_number,n.title_label,n.badge,n.mrp,n.offer_price,
        n.discount_pct,n.numerology_sum,n.operator,n.stock,n.status,n.visibility_type,n.rtp_status,n.rtp_available_at,n.is_featured`;
      const countQ: any = await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM vip_numbers n WHERE ${where.join(' AND ')}`, params);
      const listQ: any = await this.dao.executeQuery(
        `SELECT ${columns} FROM vip_numbers n WHERE ${where.join(' AND ')} ORDER BY ${order}, n.number_id DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      res.status = 1; res.info = 'OK';
      res.data = {
        items: (listQ.rows || []).map((item: any) => decorateNumberCategories({ ...item, is_premium: Boolean(Number(item.is_featured)) })),
        total: Number(countQ.rows?.[0]?.total || 0), page, limit,
      };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async quote(payload: any) { return this.create(payload, true); }
  async create(payload: any, quoteOnly = false) {
    const res = this.response();
    let connection: any;
    try {
      if (!quoteOnly) {
        connection = await this.dao.getConnection(); await assertCheckoutSchema(connection);
        await this.reconcile();
      }
      const userId = Number(payload.user_id);
      const numberId = Number(payload.number_id);
      if (!userId || !numberId) throw new Error('Choose a number to pre-book.');
      connection = connection || await this.dao.getConnection();
      await connection.beginTransaction();
      const [numbers]: any = await connection.query(
        `SELECT number_id,display_number,mrp,offer_price,seller_id,seller_type,status,stock,visibility_type,rtp_status,rtp_available_at
         FROM vip_numbers WHERE number_id=? AND deleted_at IS NULL FOR UPDATE`, [numberId],
      );
      const number = numbers?.[0];
      if (!number || number.status !== 'AVAILABLE' || Number(number.stock) <= 0) throw new Error('This number is no longer available for pre-booking.');
      if (number.rtp_status !== 'NON_RTP' || !number.rtp_available_at || new Date(number.rtp_available_at + 'Z') <= new Date()) {
        throw new Error('This number is already ready to purchase.');
      }
      let privateLinkId: number | null = null;
      if (number.visibility_type === 'OFFLINE') {
        const link = await resolvePrivateLinkWithConnection(connection, String(payload.private_token || ''), numberId);
        if (!link) throw new Error('This Offline number is only available through its active private link.');
        privateLinkId = Number(link.private_link_id);
      }
      const billing = await loadBilling(connection, [number]);
      if (quoteOnly) {
        await connection.commit(); res.status = 1; res.info = 'OK'; res.data = billing; return res;
      }
      const [users]: any = await connection.query('SELECT full_name,email,phone FROM auth_user WHERE user_id=?', [userId]);
      const user = users?.[0] || {};
      const orderNo = 'VNW-PB-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
      const holdExpires = new Date(Date.now() + HOLD_MINUTES * 60_000);
      const [orderInsert]: any = await connection.query(
        `INSERT INTO orders (order_no,user_id,subtotal,discount,total,status,payment_status,order_type,payment_expires_at,customer_name,customer_email,customer_phone,mrp_total,offer_savings,taxable_amount,gst_percent,gst_amount)
         VALUES (?,?,?,?,?,'PENDING','UNPAID','PREBOOK',?,?,?,?,?,?,?,?,?)`,
        [orderNo, userId, billing.subtotal, 0, billing.total, sqlUtc(holdExpires), user.full_name, user.email, user.phone,billing.mrp_total,billing.offer_savings,billing.taxable_amount,billing.gst_percent,billing.gst_amount],
      );
      const orderId = Number(orderInsert.insertId);
      let commission = 0;
      if (number.seller_type === 'DEALER') {
        const [dealers]: any = await connection.query('SELECT commission_pct FROM dealer_profiles WHERE dealer_id=?', [number.seller_id]);
        commission = Number(number.offer_price) * Number(dealers?.[0]?.commission_pct ?? 10) / 100;
      }
      await connection.query(
        `INSERT INTO order_items (order_id,number_id,private_link_id,seller_id,display_number,price,commission_amount,item_status)
         VALUES (?,?,?,?,?,?,?,'PENDING')`,
        [orderId,numberId,privateLinkId,number.seller_id,number.display_number,number.offer_price,commission],
      );
      const [prebookInsert]: any = await connection.query(
        `INSERT INTO prebookings (order_id,user_id,number_id,status,rtp_available_at_snapshot,hold_expires_at)
         VALUES (?,?,?,'PENDING_PAYMENT',?,?)`,
        [orderId, userId, numberId, number.rtp_available_at, sqlUtc(holdExpires)],
      );
      const [reserved]: any = await connection.query(
        `UPDATE vip_numbers SET status='RESERVED' WHERE number_id=? AND status='AVAILABLE' AND rtp_status='NON_RTP'`, [numberId],
      );
      if (reserved.affectedRows !== 1) throw new Error('This number was just reserved by another customer.');
      await connection.query("UPDATE orders SET payment_provider='CASHFREE',gateway_environment=? WHERE order_id=?", [cashfreeMode(), orderId]);
      await new PaymentHistory(this.dao).event({ order_id: orderId, user_id: userId }, 'CHECKOUT_CREATED', 'UNPAID', { ...billing, order_type: 'PREBOOK' }, 'CHECKOUT', connection, `checkout:${orderId}`);
      await connection.commit();
      res.status = 1; res.info = 'Pre-book payment hold created.';
      res.data = { prebook_id: Number(prebookInsert.insertId), order_id: orderId, order_no: orderNo, ...billing, payment_expires_at: sqlUtc(holdExpires) };
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
      res.status = -33; res.info = 'catch : ' + error;
    } finally { if (connection) connection.release(); }
    return res;
  }

  async finalizePaid(orderId: number, pay: any) {
    let connection: any;
    try {
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const [orders]: any = await connection.query(`SELECT * FROM orders WHERE order_id=? FOR UPDATE`, [orderId]);
      const order = orders?.[0];
      if (!order || order.order_type !== 'PREBOOK') throw new Error('Pre-book order not found.');
      if (['PAID', 'REFUNDED'].includes(order.payment_status)) { await connection.commit(); return order; }
      const [prebooks]: any = await connection.query(`SELECT * FROM prebookings WHERE order_id=? FOR UPDATE`, [orderId]);
      const prebook = prebooks?.[0];
      if (!prebook || prebook.status !== 'PENDING_PAYMENT') throw new PaymentHoldError('Pre-book payment hold is no longer active.');
      const paidAt = utcDate(pay.paid_at);
      if (order.status !== 'PENDING' || !Number.isFinite(paidAt.getTime()) || paidAt.getTime() > utcDate(prebook.hold_expires_at).getTime()) throw new PaymentHoldError('Pre-book payment hold expired.');
      const [inventory]: any = await connection.query('SELECT status FROM vip_numbers WHERE number_id=? FOR UPDATE', [prebook.number_id]);
      if (inventory?.[0]?.status !== 'RESERVED') throw new PaymentHoldError('The reserved number is no longer available.');
      await connection.query(
        `UPDATE orders SET status='PAID',payment_status='PAID',gateway_order_id=?,gateway_payment_id=? WHERE order_id=?`,
        [pay.gateway_order_id || order.gateway_order_id, pay.gateway_payment_id || null, orderId],
      );
      await connection.query(`UPDATE order_items SET item_status='PAID' WHERE order_id=?`, [orderId]);
      await new PaymentHistory(this.dao).event({ ...order, gateway_payment_id: pay.gateway_payment_id }, 'ORDER_PAID', 'PAID', { paid_at: pay.paid_at, total: order.total }, 'SERVER', connection, `paid:${orderId}`);
      await connection.query(
        `UPDATE prebookings SET status=IF(rtp_available_at_snapshot<=UTC_TIMESTAMP(),'READY','BOOKED'),paid_at=?,cancellation_deadline=DATE_ADD(?,INTERVAL ${CANCELLATION_HOURS} HOUR) WHERE prebook_id=?`,
        [sqlUtc(paidAt), sqlUtc(paidAt), prebook.prebook_id],
      );
      if (new Date(prebook.rtp_available_at_snapshot + 'Z') <= new Date()) {
        await connection.query(`UPDATE vip_numbers SET rtp_status='RTP' WHERE number_id=?`, [prebook.number_id]);
        await connection.query(`UPDATE orders SET status='PROCESSING' WHERE order_id=?`, [orderId]);
      }
      await connection.commit();
      await pushNotification({ user_id: order.user_id, type: 'order', title: 'Pre-book confirmed', message: `Your paid pre-book ${order.order_no} is exclusively reserved.` });
      return { ...order, payment_status: 'PAID' };
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
      throw error;
    } finally { if (connection) connection.release(); }
  }

  async failPending(orderId: number): Promise<void> {
    let connection: any;
    let failed: any = null;
    try {
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT p.prebook_id,p.number_id,p.user_id,p.status,o.payment_status,n.display_number FROM prebookings p
         INNER JOIN orders o ON o.order_id=p.order_id INNER JOIN vip_numbers n ON n.number_id=p.number_id
         WHERE p.order_id=? FOR UPDATE`, [orderId],
      );
      const pending = rows?.[0];
      if (pending?.status === 'PENDING_PAYMENT' && pending.payment_status !== 'PAID') {
        await connection.query(`UPDATE prebookings SET status='FAILED' WHERE prebook_id=?`, [pending.prebook_id]);
        await connection.query(`UPDATE orders SET status='CANCELLED',payment_status='FAILED' WHERE order_id=?`, [orderId]);
        await connection.query(`UPDATE order_items SET item_status='CANCELLED' WHERE order_id=?`, [orderId]);
        await connection.query(`UPDATE vip_numbers SET status='AVAILABLE' WHERE number_id=? AND status='RESERVED'`, [pending.number_id]);
        await new PaymentHistory(this.dao).event({ order_id: orderId, user_id: pending.user_id }, 'HOLD_RELEASED', 'FAILED', {}, 'SERVER', connection, `released:${orderId}`);
        failed = pending;
      }
      await connection.commit();
      if (failed) { try { await pushNotification({ user_id: failed.user_id, type: 'order', title: 'Pre-book payment failed', message: `${failed.display_number} was released and is available to pre-book again.` }); } catch {} }
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch {} }
      throw error;
    } finally { if (connection) connection.release(); }
  }

  async my(payload: any) {
    const res = this.response();
    try {
      await this.reconcile();
      const q: any = await this.dao.executeQuery(
        `SELECT p.*,o.order_no,o.total,o.payment_status,o.status AS order_status,o.gateway_payment_id,
                n.display_number,n.number_value,n.operator,n.rtp_status,n.rtp_available_at,n.offer_price,
                r.refund_request_id,r.status AS refund_status,r.reason_type,r.gateway_status
         FROM prebookings p INNER JOIN orders o ON o.order_id=p.order_id
         INNER JOIN vip_numbers n ON n.number_id=p.number_id
         LEFT JOIN prebook_refund_requests r ON r.refund_request_id=(SELECT MAX(rr.refund_request_id) FROM prebook_refund_requests rr WHERE rr.prebook_id=p.prebook_id)
         WHERE p.user_id=? ORDER BY p.created_at DESC`, [Number(payload.user_id)],
      );
      res.status = 1; res.info = 'OK';
      res.data = (q.rows || []).map((row: any) => ({
        ...row,
        can_cancel: ['BOOKED', 'READY'].includes(row.status) && isCancellationEligible(row.cancellation_deadline),
        cancellation_seconds_remaining: row.cancellation_deadline ? Math.max(0, Math.floor((new Date(row.cancellation_deadline + 'Z').getTime() - Date.now()) / 1000)) : 0,
      }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  private async requestRefund(payload: any, reason: string, admin = false) {
    const res = this.response();
    let connection: any;
    try {
      const prebookId = Number(payload.prebook_id);
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const params = admin ? [prebookId] : [prebookId, Number(payload.user_id)];
      const [rows]: any = await connection.query(
        `SELECT p.*,o.total,o.payment_status FROM prebookings p INNER JOIN orders o ON o.order_id=p.order_id
         WHERE p.prebook_id=? ${admin ? '' : 'AND p.user_id=?'} FOR UPDATE`, params,
      );
      const prebook = rows?.[0];
      if (!prebook || !['BOOKED', 'READY'].includes(prebook.status) || prebook.payment_status !== 'PAID') throw new Error('This pre-book cannot be refunded.');
      if (reason === 'CUSTOMER_CANCELLATION' && !isCancellationEligible(prebook.cancellation_deadline)) {
        throw new Error('The 48-hour cancellation window has ended.');
      }
      const [existing]: any = await connection.query(
        `SELECT refund_request_id FROM prebook_refund_requests WHERE prebook_id=? AND status IN ('PENDING','APPROVED','PROCESSING','FAILED') LIMIT 1`, [prebookId],
      );
      if (existing?.length) throw new Error('A refund request is already open for this pre-book.');
      const [inserted]: any = await connection.query(
        `INSERT INTO prebook_refund_requests (prebook_id,user_id,reason_type,status,status_before_request,amount,customer_note)
         VALUES (?,?,?,'PENDING',?,?,?)`,
        [prebookId, prebook.user_id, reason, prebook.status, prebook.total, String(payload.note || '').trim().slice(0, 1000) || null],
      );
      await connection.query(`UPDATE prebookings SET status='CANCEL_REQUESTED',issue_note=? WHERE prebook_id=?`, [String(payload.note || '').trim().slice(0, 1000) || null, prebookId]);
      await new PaymentHistory(this.dao).event({ order_id: prebook.order_id, user_id: payload.user_id }, 'REFUND_REQUESTED', 'PENDING', { refund_request_id: inserted.insertId, reason, amount: prebook.total }, admin ? 'ADMIN' : 'CUSTOMER', connection, `refund-request:${inserted.insertId}`);
      await connection.commit();
      res.status = 1; res.info = 'Refund request submitted for admin review.'; res.data = { refund_request_id: Number(inserted.insertId) };
      await pushNotification({ user_id: prebook.user_id, type: 'order', title: 'Refund request received', message: 'Your request is awaiting admin review.' });
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
      res.status = -33; res.info = 'catch : ' + error;
    } finally { if (connection) connection.release(); }
    return res;
  }

  async cancel(payload: any) { return this.requestRefund(payload, 'CUSTOMER_CANCELLATION', false); }
  async reportIssue(payload: any) {
    const reason = String(payload.reason_type || 'DELIVERY_ISSUE').toUpperCase();
    if (!ISSUE_REASONS.includes(reason)) {
      const res = this.response(); res.status = -33; res.info = 'Choose a valid issue type.'; return res;
    }
    return this.requestRefund(payload, reason, false);
  }
  async markUnavailable(payload: any) { return this.requestRefund(payload, 'NUMBER_UNAVAILABLE', true); }

  async adminList(payload: any) {
    const res = this.response();
    try {
      await this.reconcile();
      const where: string[] = []; const params: any[] = [];
      if (payload.status) { where.push('p.status=?'); params.push(String(payload.status).toUpperCase()); }
      if (payload.q) { where.push('(n.display_number LIKE ? OR o.order_no LIKE ? OR u.full_name LIKE ?)'); params.push(...Array(3).fill(`%${String(payload.q).slice(0, 64)}%`)); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const page = Math.max(1, Math.floor(Number(payload.page) || 1));
      const limit = Math.min(1000, Math.max(1, Math.floor(Number(payload.limit) || 20)));
      const count: any = await this.dao.executeQuery(
        `SELECT COUNT(*) AS total FROM prebookings p INNER JOIN orders o ON o.order_id=p.order_id INNER JOIN vip_numbers n ON n.number_id=p.number_id INNER JOIN auth_user u ON u.user_id=p.user_id ${whereSql}`, params);
      const total = Number(count.rows?.[0]?.total || 0);
      const q: any = await this.dao.executeQuery(
        `SELECT p.*,o.order_no,o.total,o.payment_status,o.status AS order_status,o.gateway_payment_id,
                n.display_number,n.rtp_status,n.rtp_available_at,n.status AS number_status,u.full_name,u.email,u.phone
         FROM prebookings p INNER JOIN orders o ON o.order_id=p.order_id
         INNER JOIN vip_numbers n ON n.number_id=p.number_id INNER JOIN auth_user u ON u.user_id=p.user_id
         ${whereSql} ORDER BY p.created_at DESC, p.prebook_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit],
      );
      res.status = 1; res.info = 'OK'; res.data = { items: q.rows || [], total, page, limit, pages: Math.ceil(total / limit) };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async refundList(payload: any) {
    const res = this.response();
    try {
      const where = payload.status ? 'WHERE r.status=?' : '';
      const params = payload.status ? [String(payload.status).toUpperCase()] : [];
      const page = Math.max(1, Math.floor(Number(payload.page) || 1));
      const limit = Math.min(1000, Math.max(1, Math.floor(Number(payload.limit) || 20)));
      const count: any = await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM prebook_refund_requests r ${where}`, params);
      const total = Number(count.rows?.[0]?.total || 0);
      const q: any = await this.dao.executeQuery(
        `SELECT r.*,p.order_id,p.number_id,p.status AS prebook_status,o.order_no,o.gateway_payment_id,
                n.display_number,u.full_name,u.email
         FROM prebook_refund_requests r INNER JOIN prebookings p ON p.prebook_id=r.prebook_id
         INNER JOIN orders o ON o.order_id=p.order_id INNER JOIN vip_numbers n ON n.number_id=p.number_id
         INNER JOIN auth_user u ON u.user_id=p.user_id ${where} ORDER BY r.requested_at DESC, r.refund_request_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit],
      );
      res.status = 1; res.info = 'OK'; res.data = { items: q.rows || [], total, page, limit, pages: Math.ceil(total / limit) };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async rejectRefund(payload: any) {
    const res = this.response();
    let connection: any;
    try {
      const note = String(payload.admin_note || '').trim().slice(0, 1000);
      if (!note) throw new Error('A rejection reason is required.');
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT r.*,p.user_id,p.order_id FROM prebook_refund_requests r INNER JOIN prebookings p ON p.prebook_id=r.prebook_id
         WHERE r.refund_request_id=? FOR UPDATE`, [Number(payload.refund_request_id)],
      );
      const request = rows?.[0];
      if (!request || request.status !== 'PENDING') throw new Error('Refund request is no longer pending.');
      await connection.query(`UPDATE prebook_refund_requests SET status='REJECTED',admin_note=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE refund_request_id=?`, [note, payload.user_id, request.refund_request_id]);
      await connection.query(`UPDATE prebookings SET status=? WHERE prebook_id=? AND status='CANCEL_REQUESTED'`, [request.status_before_request, request.prebook_id]);
      await new PaymentHistory(this.dao).event({ order_id: request.order_id, user_id: payload.user_id }, 'REFUND_REJECTED', 'REJECTED', { refund_request_id: request.refund_request_id, note }, 'ADMIN', connection, `refund-rejected:${request.refund_request_id}`);
      await connection.commit();
      await pushNotification({ user_id: request.user_id, type: 'order', title: 'Refund request update', message: `Your refund request was not approved: ${note}` });
      res.status = 1; res.info = 'Refund request rejected.';
    } catch (error) { if (connection) { try { await connection.rollback(); } catch {} } res.status = -33; res.info = 'catch : ' + error; }
    finally { if (connection) connection.release(); }
    return res;
  }

  private async completeRefund(requestId: number, gateway: any) {
    let connection: any;
    try {
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT r.*,p.order_id,p.number_id,p.user_id,p.status AS prebook_status FROM prebook_refund_requests r
         INNER JOIN prebookings p ON p.prebook_id=r.prebook_id WHERE r.refund_request_id=? FOR UPDATE`, [requestId],
      );
      const request = rows?.[0];
      if (!request) throw new Error('Refund request not found.');
      // The gateway response may already be recorded before this transaction.
      // The pre-book state is the idempotency boundary for the business update.
      if (request.status === 'PROCESSED' && request.prebook_status === 'REFUNDED') { await connection.commit(); return; }
      await connection.query(
        `UPDATE prebook_refund_requests SET status='PROCESSED',gateway_status='SUCCESS',gateway_refund_id=COALESCE(?,gateway_refund_id),gateway_payload=?,processed_at=UTC_TIMESTAMP() WHERE refund_request_id=?`,
        [gateway?.refund_id || null, JSON.stringify(safePaymentData(gateway || {})), requestId],
      );
      await connection.query(`UPDATE prebookings SET status='REFUNDED',refunded_at=UTC_TIMESTAMP() WHERE prebook_id=?`, [request.prebook_id]);
      await connection.query(`UPDATE orders SET status='REFUNDED',payment_status='REFUNDED' WHERE order_id=?`, [request.order_id]);
      await new PaymentHistory(this.dao).event({ order_id: request.order_id, gateway_refund_id: gateway.refund_id }, 'REFUND_COMPLETED', 'PROCESSED', { refund_request_id: requestId, amount: request.amount, gateway }, 'SERVER', connection, `refund-completed:${gateway.refund_id}`);
      await connection.query(`UPDATE order_items SET item_status='CANCELLED' WHERE order_id=?`, [request.order_id]);
      if (request.reason_type === 'CUSTOMER_CANCELLATION') {
        await connection.query(
          `UPDATE vip_numbers SET status='AVAILABLE',stock=1,rtp_status=IF(rtp_available_at<=UTC_TIMESTAMP(),'RTP',rtp_status) WHERE number_id=?`, [request.number_id],
        );
      } else {
        await connection.query(`UPDATE vip_numbers SET status='INACTIVE',stock=0 WHERE number_id=?`, [request.number_id]);
      }
      await connection.commit();
      await pushNotification({ user_id: request.user_id, type: 'order', title: '100% refund processed', message: 'Your full pre-book payment has been refunded to the original payment method.' });
    } catch (error) { if (connection) { try { await connection.rollback(); } catch {} } throw error; }
    finally { if (connection) connection.release(); }
  }

  private async refundQuery(sql: string, values: any[]) {
    const q: any = await this.dao.executeQuery(sql, values);
    if (q.status !== 1) throw new Error('Refund storage is unavailable. Check the manual Cashfree migration.');
    return q;
  }

  private async syncRefund(request: any, create = false) {
    const history = new PaymentHistory(this.dao);
    const client = new CashfreeClient(request, history);
    let gateway: any;
    try { gateway = await client.getRefund(request.gateway_order_id, request.gateway_refund_id); }
    catch (error) { if (!create || !(error instanceof CashfreeError) || error.statusCode !== 404) throw error; }
    if (!gateway && create) gateway = await client.createRefund(request.gateway_order_id, {
      refund_id: request.gateway_refund_id, refund_amount: Number(request.amount), refund_note: 'Full pre-book refund', refund_speed: 'STANDARD',
    });
    if (gateway?.order_id !== request.gateway_order_id || gateway.refund_id !== request.gateway_refund_id ||
        gateway.refund_currency !== 'INR' || amountInPaise(gateway.refund_amount) !== amountInPaise(request.amount) ||
        (gateway.cf_payment_id && String(gateway.cf_payment_id) !== String(request.gateway_payment_id)))
      throw new Error('Cashfree refund details do not match this request.');
    const status = String(gateway.refund_status);
    await history.event(request, 'REFUND_STATUS', status, { refund_request_id: request.refund_request_id, gateway }, 'SERVER', undefined, `refund:${request.gateway_refund_id}:${status}`);
    // Never let an out-of-order failure change a completed refund.
    if (status === 'SUCCESS') await this.completeRefund(request.refund_request_id, gateway);
    else await this.refundQuery(
      `UPDATE prebook_refund_requests SET gateway_status=?,gateway_payload=?,status=? WHERE refund_request_id=? AND gateway_refund_id=? AND status<>'PROCESSED'`,
      [status, JSON.stringify(safePaymentData(gateway)), ['FAILED', 'CANCELLED'].includes(status) ? 'FAILED' : 'PROCESSING', request.refund_request_id, request.gateway_refund_id],
    );
    return gateway;
  }

  async approveRefund(payload: any) {
    const res = this.response();
    let connection: any;
    let request: any;
    let newlySubmitted = false;
    try {
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT r.*,p.order_id,o.payment_provider,o.payment_status,o.gateway_environment,o.gateway_order_id,o.gateway_payment_id,o.total
         FROM prebook_refund_requests r INNER JOIN prebookings p ON p.prebook_id=r.prebook_id
         INNER JOIN orders o ON o.order_id=p.order_id WHERE r.refund_request_id=? FOR UPDATE`, [Number(payload.refund_request_id)]);
      request = rows?.[0];
      if (!request || !['PENDING', 'FAILED', 'PROCESSING'].includes(request.status)) throw new Error('Refund request cannot be processed.');
      if (request.payment_provider !== 'CASHFREE' || request.gateway_environment !== cashfreeMode() ||
          request.payment_status !== 'PAID' || !request.gateway_order_id || !request.gateway_payment_id)
        throw new Error('A captured payment in the current Cashfree environment is required. Historical payments need provider-side review.');
      if (amountInPaise(request.amount) !== amountInPaise(request.total)) throw new Error('The refund must match the original pre-book payment.');
      if (request.status !== 'PROCESSING') {
        // A new attempt is allowed only after Cashfree reports a terminal failure.
        const attempt = Number(request.refund_attempt || 0) + 1;
        request.gateway_refund_id = `vnw_ref_${request.refund_request_id}_${attempt}`;
        await connection.query(`UPDATE prebook_refund_requests SET status='PROCESSING',refund_attempt=?,gateway_refund_id=?,gateway_status='PENDING',reviewed_by=?,reviewed_at=UTC_TIMESTAMP(),admin_note=? WHERE refund_request_id=?`,
          [attempt, request.gateway_refund_id, payload.user_id, String(payload.admin_note || '').trim().slice(0, 1000) || null, request.refund_request_id]);
        newlySubmitted = true;
      }
      if (!request.gateway_refund_id) throw new Error('The refund reference is missing. Contact support.');
      await connection.query("UPDATE prebookings SET status='REFUND_PENDING' WHERE prebook_id=?", [request.prebook_id]);
      await new PaymentHistory(this.dao).event({ ...request, user_id: payload.user_id }, 'REFUND_APPROVED', 'PROCESSING', { refund_request_id: request.refund_request_id, amount: request.amount }, 'ADMIN', connection, `refund-approved:${request.gateway_refund_id}`);
      await connection.commit(); connection.release(); connection = null;
      const gateway = await this.syncRefund(request, true);
      if (newlySubmitted && gateway.refund_status !== 'SUCCESS')
        await pushNotification({ user_id: request.user_id, type: 'order', title: 'Refund submitted', message: 'Your full refund has been submitted to Cashfree.' });
      res.status = 1; res.info = gateway.refund_status === 'SUCCESS' ? 'Refund processed.' : 'Cashfree refund status refreshed.';
      res.data = { refund_id: gateway.refund_id, status: gateway.refund_status };
    } catch (error: any) {
      if (connection) { try { await connection.rollback(); } catch {} }
      // A timeout may follow a successful submission. Keep PROCESSING and reuse the same
      // reference/idempotency key when checking again, rather than refunding twice.
      res.status = -33; res.info = error.message || 'Refund processing delayed. Check its status before retrying.';
    } finally { connection?.release(); }
    return res;
  }

  async handleRefundWebhook(refundId: string) {
    if (!refundId) return;
    const q = await this.refundQuery(
      `SELECT r.*,p.order_id,o.gateway_order_id,o.gateway_payment_id,o.gateway_environment FROM prebook_refund_requests r
       JOIN prebookings p ON p.prebook_id=r.prebook_id JOIN orders o ON o.order_id=p.order_id
       WHERE r.gateway_refund_id=? AND o.payment_provider='CASHFREE' AND o.gateway_environment=?`,
      [refundId, cashfreeMode()]);
    if (q.rows?.[0]) await this.syncRefund(q.rows[0]);
  }

  async fulfill(payload: any) {
    const res = this.response();
    let connection: any;
    try {
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT p.*,o.order_no,o.total,oi.order_item_id,oi.seller_id,oi.price,oi.commission_amount,u.role AS seller_role,n.display_number
         FROM prebookings p INNER JOIN orders o ON o.order_id=p.order_id INNER JOIN order_items oi ON oi.order_id=o.order_id
         INNER JOIN vip_numbers n ON n.number_id=p.number_id LEFT JOIN auth_user u ON u.user_id=oi.seller_id
         WHERE p.prebook_id=? FOR UPDATE`, [Number(payload.prebook_id)],
      );
      const item = rows?.[0];
      if (!item || !['READY', 'FULFILLED'].includes(item.status)) throw new Error('Only an RTP-ready pre-book can be fulfilled.');
      if (item.status === 'READY') {
        await connection.query(`UPDATE prebookings SET status='FULFILLED',fulfilled_at=UTC_TIMESTAMP() WHERE prebook_id=?`, [item.prebook_id]);
        await connection.query(`UPDATE orders SET status='COMPLETED' WHERE order_id=?`, [item.order_id]);
        await new PaymentHistory(this.dao).event({ order_id: item.order_id, user_id: payload.user_id }, 'ORDER_FULFILLED', 'COMPLETED', {}, 'ADMIN', connection, `fulfilled:${item.order_id}`);
        await connection.query(`UPDATE order_items SET item_status='TRANSFERRED' WHERE order_id=?`, [item.order_id]);
        await connection.query(`UPDATE vip_numbers SET status='SOLD',stock=0,rtp_status='RTP' WHERE number_id=?`, [item.number_id]);
      }
      await connection.commit();
      if (String(item.seller_role).toUpperCase() === 'DEALER') {
        const net = Number((Number(item.price) - Number(item.commission_amount || 0)).toFixed(2));
        if (net > 0) await creditWallet(item.seller_id, net, 'SALE', 'order_item', item.order_item_id, `Sale of ${item.display_number} (order ${item.order_no})`);
      }
      const ref: any = await this.dao.executeQuery(`SELECT referred_by FROM auth_user WHERE user_id=?`, [item.user_id]);
      if (ref.rows?.[0]?.referred_by) {
        const reward = Number((Number(item.total) * 0.02).toFixed(2));
        await this.dao.executeQuery(
          `INSERT INTO referral_earnings (user_id,source_user_id,type,amount,order_id)
           SELECT ?,?,'PURCHASE',?,? WHERE NOT EXISTS
           (SELECT 1 FROM referral_earnings WHERE order_id=? AND type='PURCHASE')`,
          [ref.rows[0].referred_by, item.user_id, reward, item.order_id, item.order_id],
        );
      }
      await pushNotification({ user_id: item.user_id, type: 'order', title: 'Pre-book fulfilled', message: `${item.display_number} has been delivered and activated.` });
      res.status = 1; res.info = 'Pre-book fulfilled.';
    } catch (error) { if (connection) { try { await connection.rollback(); } catch {} } res.status = -33; res.info = 'catch : ' + error; }
    finally { if (connection) connection.release(); }
    return res;
  }
}

let lifecycleTimer: any;
export function startPrebookLifecycle() {
  if (lifecycleTimer) return;
  const service = new Prebooks();
  service.reconcile().catch(() => undefined);
  lifecycleTimer = setInterval(() => service.reconcile().catch(() => undefined), 60_000);
  lifecycleTimer.unref?.();
}
