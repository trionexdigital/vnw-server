import axios from 'axios';
import * as crypto from 'crypto';
import { PaymentHistory } from './paymentHistory';

export class CashfreeError extends Error {
  constructor(public statusCode: number, message: string) { super(message); this.name = 'CashfreeError'; }
}
export class PaymentHoldError extends Error {}

export function cashfreeMode(): 'sandbox' | 'production' {
  const mode = (process.env.CASHFREE_ENV || 'sandbox').trim();
  if (mode !== 'sandbox' && mode !== 'production') throw new Error('CASHFREE_ENV must be sandbox or production.');
  return mode;
}

export function cashfreeIdempotency(seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function amountInPaise(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Invalid payment amount.');
  return Math.round(number * 100);
}

export function assertCashfreeOrder(local: any, remote: any) {
  if (remote?.order_id !== local.gateway_order_id || remote.order_currency !== 'INR'
      || amountInPaise(remote.order_amount) !== amountInPaise(local.total)) throw new Error('Cashfree order amount, currency or reference does not match the purchase.');
}

export function assertCashfreePayment(local: any, payment: any) {
  if (payment?.payment_status !== 'SUCCESS' || !payment.cf_payment_id || payment.payment_currency !== 'INR'
      || amountInPaise(payment.payment_amount) !== amountInPaise(local.total)
      || (payment.order_id && payment.order_id !== local.gateway_order_id)) throw new Error('Cashfree payment amount, currency or reference does not match the purchase.');
}

export function verifyCashfreeSignature(raw: string, signature: string, timestamp: string, secret = (process.env.CASHFREE_SECRET_KEY || '').trim()): boolean {
  if (!secret || !raw || !signature || !/^\d{10,16}$/.test(timestamp)) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp + raw).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

export function utcDate(value: any): Date {
  if (value instanceof Date) return value;
  const text = String(value || '').replace(' ', 'T');
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : text + 'Z');
}

function publicUrl(value: string, required: boolean): string | undefined {
  if (!value && !required) return undefined;
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(cashfreeMode() === 'sandbox' && local && url.protocol === 'http:'))) throw new Error('Cashfree URLs must use HTTPS (localhost HTTP is allowed only in sandbox).');
  return url.toString();
}

export function cashfreeOrderMeta(orderId: number) {
  const base = publicUrl((process.env.CASHFREE_RETURN_BASE_URL || process.env.APP_BASE_URL || '').trim(), true)!;
  const returnUrl = new URL('/payments/return', base);
  returnUrl.searchParams.set('order_id', String(orderId));
  const notify = publicUrl((process.env.CASHFREE_WEBHOOK_URL || '').trim(), false);
  return { return_url: returnUrl.toString(), ...(notify ? { notify_url: notify } : {}) };
}

/** Server-only API client. Never return or log Axios errors: they contain credential headers. */
export class CashfreeClient {
  constructor(private context: import('./paymentHistory').PaymentContext = {}, private history = new PaymentHistory()) {}
  async request(method: 'GET' | 'POST', path: string, body?: any, idempotencySeed?: string): Promise<any> {
    const mode = cashfreeMode();
    const clientId = (process.env.CASHFREE_APP_ID || '').trim();
    const secret = (process.env.CASHFREE_SECRET_KEY || '').trim();
    if (!clientId || !secret) throw new CashfreeError(503, 'Cashfree payment gateway is not configured.');
    const correlation = crypto.randomUUID();
    const context = { ...this.context, payment_provider: 'CASHFREE', environment: mode };
    // Persist intent before contacting the gateway. A storage failure prevents an untracked request.
    await this.history.event(context, 'GATEWAY_REQUEST', 'STARTED', { method, path, body, idempotency_key: idempotencySeed ? cashfreeIdempotency(idempotencySeed) : null }, 'API', undefined, undefined, correlation);
    let response: any;
    try {
      response = await axios.request({
        method, url: `${mode === 'sandbox' ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com'}/pg${path}`,
        timeout: 12000, maxRedirects: 0,
        headers: { 'x-client-id': clientId, 'x-client-secret': secret, 'x-api-version': '2025-01-01',
          'Content-Type': 'application/json', ...(idempotencySeed ? { 'x-idempotency-key': cashfreeIdempotency(idempotencySeed) } : {}) },
        data: body,
      });
    } catch (error: any) {
      const status = Number(error?.response?.status || 503);
      await this.history.event(context, 'GATEWAY_RESPONSE', status === 404 ? 'NOT_FOUND' : 'ERROR', { http_status: status, code: String(error?.response?.data?.code || '').slice(0, 128) }, 'API', undefined, undefined, correlation);
      throw new CashfreeError(status, status === 404 ? 'Cashfree record was not found.' : status === 401 || status === 403
        ? 'Cashfree rejected the gateway configuration. Check the server keys and environment.'
        : 'Cashfree could not complete this request. Please retry or contact support.');
    }
    await this.history.event(context, 'GATEWAY_RESPONSE', 'OK', { http_status: response.status, body: response.data }, 'API', undefined, undefined, correlation);
    return response.data;
  }
  createOrder(body: any) { return this.request('POST', '/orders', body, `cashfree:${cashfreeMode()}:order:${body.order_id}`); }
  getOrder(id: string) { return this.request('GET', `/orders/${encodeURIComponent(id)}`); }
  getPayments(id: string) { return this.request('GET', `/orders/${encodeURIComponent(id)}/payments`); }
  createRefund(orderId: string, body: any) { return this.request('POST', `/orders/${encodeURIComponent(orderId)}/refunds`, body, `cashfree:${cashfreeMode()}:refund:${body.refund_id}`); }
  getRefund(orderId: string, refundId: string) { return this.request('GET', `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`); }
}
