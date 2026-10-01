import crypto from 'crypto';
import { MySqlClient } from '../../../gen_db/database';

export const PAYMENT_SCHEMA_MESSAGE = 'Checkout database update required. Please run 20261001_payment_history_checkout_sqlyog.sql in SQLyog, then restart the API.';
export function visibleOrder(order: any) {
  const { gateway_session_id, legacy_signature, ...visible } = order;
  return visible;
}

/** Store useful gateway metadata without credentials, sessions or payment authentication data. */
export function safePaymentData(value: any, depth = 0): any {
  if (depth > 8) return '[nested data omitted]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safePaymentData(item, depth + 1));
  const result: any = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|signature|token|session|password|authorization|client.?id|api.?key|cvv|cvc|otp|pin|cryptogram/i.test(key)) continue;
    if (/card.?number|account.?number|upi.?id|vpa/i.test(key)) {
      result[key] = typeof item === 'string' ? `***${item.replace(/\s/g, '').slice(-4)}` : '[masked]';
    } else if (/card/i.test(key) && !/last.?4|type|bank|network|country|scheme/i.test(key) && typeof item !== 'object') {
      result[key] = '[masked]';
    } else result[key] = safePaymentData(item, depth + 1);
  }
  return result;
}

export async function assertCheckoutSchema(connection: any) {
  const [rows]: any = await connection.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('orders','payments','payment_events')`);
  const fields = new Set((rows || []).map((row: any) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
  const required = ['orders.mrp_total','orders.offer_savings','orders.taxable_amount','orders.gst_percent','orders.gst_amount',
    'orders.payment_provider','orders.gateway_environment','orders.gateway_order_id','orders.gateway_payment_id','orders.gateway_session_id',
    'payments.payment_time','payments.payment_completion_time','payments.payment_details','payments.bank_reference','payments.payment_message','payment_events.event_id'];
  if (required.some((field) => !fields.has(field))) throw new Error(PAYMENT_SCHEMA_MESSAGE);
}

export interface PaymentContext { order_id?: number; user_id?: number; actor_user_id?: number; payment_provider?: string; gateway_environment?: string; gateway_order_id?: string; gateway_payment_id?: string; gateway_refund_id?: string; environment?: string; }

export class PaymentHistory {
  constructor(private dao: any = new MySqlClient('pixels')) {}
  async event(context: PaymentContext, type: string, status: string, details: any = {}, source = 'SERVER', connection?: any, unique?: string, correlation?: string) {
    const sql = `INSERT INTO payment_events
      (order_id,actor_user_id,payment_provider,gateway_environment,gateway_order_id,gateway_payment_id,gateway_refund_id,event_type,status,source,correlation_id,dedupe_key,details,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE event_id=event_id`;
    const data = JSON.stringify(safePaymentData(details));
    const actor = context.actor_user_id || (['CUSTOMER','ADMIN','CHECKOUT'].includes(source) ? context.user_id : null);
    const params = [context.order_id || null, actor || null, context.payment_provider || 'CASHFREE', context.environment || context.gateway_environment || (context.payment_provider === 'LEGACY' ? 'legacy' : process.env.CASHFREE_ENV || 'sandbox'),
      context.gateway_order_id || null, context.gateway_payment_id || null, context.gateway_refund_id || null,
      type.slice(0, 48), status.slice(0, 32), source.slice(0, 24), correlation || crypto.randomUUID(),
      unique ? crypto.createHash('sha256').update(unique).digest('hex') : null, data];
    if (connection) { await connection.query(sql, params); return; }
    const result = await this.dao.executeQuery(sql, params);
    if (result.status !== 1) throw new Error(PAYMENT_SCHEMA_MESSAGE);
  }
}
