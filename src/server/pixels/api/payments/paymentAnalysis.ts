import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { cashfreeMode } from './cashfree';
import { PAYMENT_SCHEMA_MESSAGE, safePaymentData } from './paymentHistory';

export function paymentFilters(payload: any) {
  const environment = String(payload.environment || cashfreeMode());
  if (!['sandbox','production','legacy'].includes(environment)) throw new Error('Choose a payment environment.');
  const where = ["COALESCE(o.gateway_environment,'legacy')=?"]; const params: any[] = [environment];
  const day = (value: any, end: boolean) => {
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Choose a valid date.');
    const date = new Date(`${text}T00:00:00+05:30`);
    if (!Number.isFinite(date.getTime()) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error('Choose a valid date.');
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  };
  if (payload.from) { where.push('o.created_at>=?'); params.push(day(payload.from, false)); }
  if (payload.to) { where.push('o.created_at<?'); params.push(day(payload.to, true)); }
  if (payload.from && payload.to && payload.from > payload.to) throw new Error('Start date must precede end date.');
  if (payload.status) {
    if (!['UNPAID','PAID','FAILED','REFUNDED','REVIEW'].includes(payload.status)) throw new Error('Choose a valid status.');
    where.push(payload.status === 'REVIEW' ? "EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.order_id AND p.status='REVIEW')" : 'o.payment_status=?');
    if (payload.status !== 'REVIEW') params.push(payload.status);
  }
  if (payload.q) { where.push('(o.order_no LIKE ? OR o.gateway_order_id LIKE ? OR o.gateway_payment_id LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ?)'); params.push(...Array(5).fill(`%${String(payload.q).trim().slice(0, 96)}%`)); }
  return { where: where.join(' AND '), params, environment };
}

/** This service is exposed exclusively through requireAdmin-protected routes. */
export class PaymentAnalysis {
  private dao = new MySqlClient('pixels');
  private async query(sql: string, params: any[]) {
    const result: any = await this.dao.executeQuery(sql, params);
    if (result.status !== 1) throw new Error(PAYMENT_SCHEMA_MESSAGE);
    return result.rows || [];
  }
  private async respond(action: () => Promise<any>) {
    const response = new MasterModel().getResponseModel();
    try { response.data = await action(); response.status = 1; response.info = 'OK'; }
    catch (error: any) { response.status = -33; response.info = error.message || 'Payment history could not be loaded.'; }
    return response;
  }
  async overview(payload: any) { return this.respond(async () => {
    const { where, params, environment } = paymentFilters(payload);
    const page = Math.max(1, Math.min(1000000, Math.floor(Number(payload.page) || 1)));
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(payload.limit) || 25)));
    const [orders, attempts, refunds, daily, methods, items] = await Promise.all([
      this.query(`SELECT COUNT(*) AS total,SUM(o.payment_status IN ('PAID','REFUNDED')) AS paid_orders,
        SUM(o.payment_status='UNPAID' AND o.status='PENDING') AS pending_orders,SUM(o.payment_status='FAILED') AS failed_orders,
        SUM(EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.order_id AND p.status='REVIEW')) AS review_orders
        FROM orders o WHERE ${where}`, params),
      this.query(`SELECT COUNT(*) AS attempts,SUM(p.status='FAILED') AS failed_attempts,SUM(p.status='USER_DROPPED') AS dropped_attempts,
        SUM(p.status IN ('SUCCESS','REVIEW')) AS successful_attempts,
        COALESCE(SUM(IF(p.status IN ('SUCCESS','REVIEW'),p.amount,0)),0) AS captured
        FROM payments p JOIN orders o ON o.order_id=p.order_id WHERE ${where} AND p.currency='INR'`, params),
      this.query(`SELECT COALESCE(SUM(IF(r.status='PROCESSED',r.amount,0)),0) AS refunded,
        COALESCE(SUM(IF(r.status IN ('PENDING','APPROVED','PROCESSING'),r.amount,0)),0) AS refund_pending
        FROM prebook_refund_requests r JOIN prebookings b ON b.prebook_id=r.prebook_id JOIN orders o ON o.order_id=b.order_id WHERE ${where}`, params),
      this.query(`SELECT DATE(DATE_ADD(o.created_at,INTERVAL 330 MINUTE)) AS day,COUNT(*) AS orders,
        SUM(o.payment_status IN ('PAID','REFUNDED')) AS paid_orders,
        COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.order_id AND p.currency='INR' AND p.status IN ('SUCCESS','REVIEW'))),0) AS captured
        FROM orders o WHERE ${where} GROUP BY day ORDER BY day DESC LIMIT 30`, params),
      this.query(`SELECT COALESCE(NULLIF(p.method,''),'Unknown') AS method,COUNT(*) AS attempts,
        SUM(p.status IN ('SUCCESS','REVIEW')) AS successful,COALESCE(SUM(IF(p.status IN ('SUCCESS','REVIEW'),p.amount,0)),0) AS captured
        FROM payments p JOIN orders o ON o.order_id=p.order_id WHERE ${where} AND p.currency='INR' GROUP BY method ORDER BY captured DESC`, params),
      this.query(`SELECT o.order_id,o.order_no,o.order_type,o.customer_name,o.customer_email,o.total,o.payment_status,o.status,o.gateway_order_id,o.gateway_payment_id,o.created_at,
        (SELECT COUNT(*) FROM payments p WHERE p.order_id=o.order_id) AS attempts,
        EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.order_id AND p.status='REVIEW') AS needs_review
        FROM orders o WHERE ${where} ORDER BY o.created_at DESC,o.order_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page-1)*limit]),
    ]);
    const stats = { ...orders[0], ...attempts[0], ...refunds[0] };
    return { environment, stats: { ...stats, net_captured: Math.round((Number(stats.captured || 0)-Number(stats.refunded || 0))*100)/100 }, daily, methods, items, total: Number(stats.total || 0), page, limit };
  }); }
  async detail(payload: any) { return this.respond(async () => {
    const id = Number(payload.order_id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Order not found.');
    const rows = await this.query('SELECT * FROM orders WHERE order_id=?', [id]);
    const order = rows[0]; if (!order) throw new Error('Order not found.');
    const before = Number(payload.before_event_id);
    const [items, attempts, refunds, events] = await Promise.all([
      this.query('SELECT display_number,price,item_status FROM order_items WHERE order_id=? ORDER BY order_item_id', [id]),
      this.query('SELECT * FROM payments WHERE order_id=? ORDER BY payment_id DESC', [id]),
      this.query(`SELECT r.* FROM prebook_refund_requests r JOIN prebookings b ON b.prebook_id=r.prebook_id WHERE b.order_id=? ORDER BY r.refund_request_id DESC`, [id]),
      this.query(`SELECT * FROM payment_events WHERE (order_id=? OR (gateway_environment=? AND gateway_order_id=?))
        ${Number.isSafeInteger(before) && before>0 ? 'AND event_id<?' : ''} ORDER BY event_id DESC LIMIT 101`,
        [id, order.gateway_environment || 'legacy', order.gateway_order_id, ...(Number.isSafeInteger(before) && before>0 ? [before] : [])]),
    ]);
    const decode = (value: any) => { try { return safePaymentData(JSON.parse(value || '{}')); } catch { return {}; } };
    return { order: safePaymentData(order), items, attempts: attempts.map((row: any) => ({ ...safePaymentData(row), raw_payload: decode(row.raw_payload), payment_details: decode(row.payment_details) })),
      refunds: refunds.map((row: any) => ({ ...safePaymentData(row), gateway_payload: decode(row.gateway_payload) })),
      events: events.slice(0,100).map((row: any) => ({ ...row, details: decode(row.details) })),
      next_event_id: events.length > 100 ? events[99].event_id : null };
  }); }
}
