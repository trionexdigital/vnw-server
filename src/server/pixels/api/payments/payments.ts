import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { Orders } from '../orders/orders';
import { Prebooks } from '../prebooks/prebooks';
import { CashfreeClient, CashfreeError, PaymentHoldError, cashfreeMode, cashfreeOrderMeta, assertCashfreeOrder, assertCashfreePayment, utcDate, verifyCashfreeSignature } from './cashfree';
import crypto from 'crypto';
import { PaymentHistory, safePaymentData, assertCheckoutSchema } from './paymentHistory';

export class Payments {
    private dao = new MySqlClient('pixels');
    private masterModel = new MasterModel();
    private orders = new Orders();
    private prebooks = new Prebooks();
    private gateway = new CashfreeClient();

    private async query(sql: string, params: any[] = []) {
        const result: any = await this.dao.executeQuery(sql, params);
        if (result.status !== 1) throw new Error('Payment storage is unavailable. Check the manual Cashfree migration.');
        return result;
    }
    private async respond(action: () => Promise<any>) {
        const res = this.masterModel.getResponseModel();
        try { res.data = await action(); res.status = 1; res.info = 'OK'; }
        catch (error: any) { res.status = -33; res.info = error.message || 'Payment request failed.'; }
        return res;
    }
    private async owned(payload: any) {
        const id = Number(payload.order_id);
        if (!Number.isSafeInteger(id) || id <= 0 || !payload.user_id) throw new Error('Order not found.');
        const q = await this.query('SELECT * FROM orders WHERE order_id=? AND user_id=?', [id, payload.user_id]);
        if (!q.rows?.[0]) throw new Error('Order not found.');
        return q.rows[0];
    }
    private checkProvider(order: any) {
        if (order.payment_provider !== 'CASHFREE' || !order.gateway_order_id || order.gateway_environment !== cashfreeMode())
            throw new Error('This order does not belong to the current Cashfree environment.');
    }
    async createCashfreeOrder(payload: any) {
        return this.respond(async () => {
            await this.owned(payload);
            let connection: any;
            try {
                connection = await this.dao.getConnection(); await assertCheckoutSchema(connection); await connection.beginTransaction();
                const [rows]: any = await connection.query('SELECT * FROM orders WHERE order_id=? AND user_id=? FOR UPDATE', [Number(payload.order_id), payload.user_id]);
                const order = rows?.[0];
                if (!order) throw new Error('Order not found.');
                if (order.payment_status === 'PAID' || order.payment_status === 'REFUNDED') {
                    await connection.commit(); return this.state(order);
                }
                if (order.status !== 'PENDING' || order.payment_status !== 'UNPAID' || !order.payment_expires_at || utcDate(order.payment_expires_at).getTime() <= Date.now())
                    throw new Error('Payment hold expired. Please start a new checkout.');
                if (order.payment_provider && order.payment_provider !== 'CASHFREE') throw new Error('This order uses a historical payment provider. Please start a new checkout.');
                if (order.payment_provider === 'CASHFREE' && order.gateway_environment && order.gateway_environment !== cashfreeMode()) throw new Error('This order belongs to a different Cashfree environment. Please start a new checkout.');
                if (order.payment_provider === 'CASHFREE' && order.gateway_order_id) this.checkProvider(order);
                const environment = cashfreeMode();
                const gatewayId = order.gateway_order_id || `vnw_${environment === 'sandbox' ? 'sb' : 'pr'}_${order.order_no}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45);
                const local = { ...order, gateway_order_id: gatewayId };
                const gateway = this.gateway instanceof CashfreeClient ? new CashfreeClient(local, new PaymentHistory(this.dao)) : this.gateway;
                let remote: any;
                try { remote = await gateway.getOrder(gatewayId); }
                catch (error) { if (!(error instanceof CashfreeError) || error.statusCode !== 404) throw error; }
                if (!remote) {
                    if (utcDate(order.payment_expires_at).getTime() - Date.now() < 16 * 60000)
                        throw new Error('Too little reservation time remains to start payment. Please wait for the hold to end and begin a new checkout.');
                    const phone = String(order.customer_phone || '').replace(/[^0-9]/g, '').replace(/^91(?=\d{10}$)/, '');
                    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Please add a valid mobile number to your profile before paying.');
                    remote = await gateway.createOrder({
                        order_id: gatewayId, order_amount: Number(order.total), order_currency: 'INR',
                        customer_details: { customer_id: `vnw_user_${order.user_id}`, customer_phone: phone,
                            ...(order.customer_name ? { customer_name: order.customer_name } : {}),
                            ...(order.customer_email ? { customer_email: order.customer_email } : {}) },
                        order_expiry_time: utcDate(order.payment_expires_at).toISOString(),
                        order_meta: cashfreeOrderMeta(order.order_id),
                    });
                }
                assertCashfreeOrder(local, remote);
                await connection.query("UPDATE orders SET payment_provider='CASHFREE',gateway_environment=?,gateway_order_id=?,gateway_session_id=? WHERE order_id=?", [environment, gatewayId, remote.payment_session_id || null, order.order_id]);
                await new PaymentHistory(this.dao).event({ ...local, environment }, 'SESSION_READY', remote.order_status, { expiry: remote.order_expiry_time, amount: remote.order_amount, currency: remote.order_currency }, 'SERVER', connection, `session:${environment}:${gatewayId}`);
                await connection.commit();
                if (remote.order_status === 'PAID') return this.sync({ ...local, payment_provider: 'CASHFREE', gateway_environment: environment });
                if (remote.order_status !== 'ACTIVE' || !remote.payment_session_id) throw new Error('This payment session is no longer active. Please start a new checkout.');
                return { order_id: order.order_id, order_no: order.order_no, payment_session_id: remote.payment_session_id, environment, payment_status: 'PENDING' };
            } catch (error) {
                try { await connection?.rollback(); } catch {}
                try { await new PaymentHistory(this.dao).event({ order_id: Number(payload.order_id), user_id: payload.user_id }, 'SESSION_ERROR', 'ERROR', { reason: error instanceof Error ? error.message : 'Session creation failed' }, 'CUSTOMER'); } catch {}
                throw error;
            }
            finally { connection?.release(); }
        });
    }
    private state(order: any, status = order.payment_status) {
        return { order_id: Number(order.order_id), order_no: order.order_no, order_type: order.order_type, payment_status: status };
    }
    private async record(order: any, payment: any) {
        await this.query(
            `INSERT INTO payments (order_id,payment_provider,gateway_environment,gateway_order_id,gateway_payment_id,amount,currency,status,method,raw_payload,payment_time,payment_completion_time,bank_reference,payment_message,payment_details)
             VALUES (?,'CASHFREE',?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
             raw_payload=VALUES(raw_payload),payment_completion_time=COALESCE(VALUES(payment_completion_time),payment_completion_time),
             bank_reference=VALUES(bank_reference),payment_message=VALUES(payment_message),payment_details=VALUES(payment_details),
             status=IF(status IN ('SUCCESS','REVIEW'),status,VALUES(status))`,
            [order.order_id, order.gateway_environment, order.gateway_order_id, String(payment.cf_payment_id), payment.payment_amount, 'INR', payment.payment_status,
                String(payment.payment_group || '').slice(0, 32), JSON.stringify(safePaymentData(payment)),
                this.sqlDate(payment.payment_time), this.sqlDate(payment.payment_completion_time), String(payment.bank_reference || '').slice(0, 128) || null,
                String(payment.payment_message || '').slice(0, 512) || null, JSON.stringify(safePaymentData(payment.payment_method || {}))]);
        await new PaymentHistory(this.dao).event({ ...order, environment: order.gateway_environment, gateway_payment_id: String(payment.cf_payment_id) }, 'PAYMENT_ATTEMPT', payment.payment_status, payment, 'GATEWAY', undefined,
            `attempt:${order.gateway_environment}:${payment.cf_payment_id}:${payment.payment_status}`);
    }
    private sqlDate(value: any) { const date = utcDate(value); return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : null; }
    private async sync(order: any) {
        try { return await this.syncUnchecked(order); }
        catch (error) {
            try { await new PaymentHistory(this.dao).event(order, 'VERIFICATION_ERROR', 'ERROR', { reason: error instanceof Error ? error.message : 'Verification failed' }); } catch {}
            throw error;
        }
    }
    private async syncUnchecked(order: any) {
        this.checkProvider(order);
        const gateway = this.gateway instanceof CashfreeClient ? new CashfreeClient(order, new PaymentHistory(this.dao)) : this.gateway;
        const remote = await gateway.getOrder(order.gateway_order_id);
        assertCashfreeOrder(order, remote);
        const payments = await gateway.getPayments(order.gateway_order_id);
        if (!Array.isArray(payments)) throw new Error('Cashfree returned an invalid payment status.');
        for (const attempt of payments) {
            if (attempt.cf_payment_id && ['FAILED', 'PENDING', 'USER_DROPPED', 'NOT_ATTEMPTED'].includes(attempt.payment_status)
                && attempt.payment_currency === 'INR' && Number(attempt.payment_amount) === Number(order.total)) await this.record(order, attempt);
        }
        const successes = payments.filter((p: any) => p.payment_status === 'SUCCESS');
        for (const success of successes) { assertCashfreePayment(order, success); await this.record(order, success); }
        if (['PAID', 'REFUNDED'].includes(order.payment_status)) return this.state(order);
        if (successes.length && remote.order_status === 'PAID') {
            const payment = successes[0];
            assertCashfreePayment(order, payment);
            const paidAt = utcDate(payment.payment_completion_time || payment.payment_time);
            if (!Number.isFinite(paidAt.getTime())) throw new Error('Cashfree payment time is invalid.');
            try {
                const pay = { gateway_order_id: order.gateway_order_id, gateway_payment_id: String(payment.cf_payment_id), paid_at: paidAt };
                const paid = order.order_type === 'PREBOOK' ? await this.prebooks.finalizePaid(order.order_id, pay) : await this.orders.finalizePaid(order.order_id, pay);
                return this.state(paid);
            } catch (error) {
                if (!(error instanceof PaymentHoldError)) throw error;
                // Never sell inventory that was released/reassigned before a late confirmation.
                const updated = await this.query("UPDATE payments SET status='REVIEW' WHERE payment_provider='CASHFREE' AND gateway_environment=? AND gateway_payment_id=? AND status<>'REVIEW'", [order.gateway_environment, String(payment.cf_payment_id)]);
                if (updated.affectedRows) {
                    await new PaymentHistory(this.dao).event({ ...order, gateway_payment_id: String(payment.cf_payment_id) }, 'FULFILMENT_REVIEW', 'REVIEW', { reason: 'Inventory reservation no longer active', amount: payment.payment_amount }, 'SERVER', undefined, `review:${order.gateway_environment}:${payment.cf_payment_id}`);
                    await this.query(`INSERT INTO notifications (user_id,type,title,message)
                      SELECT user_id,'order','Payment needs review',? FROM auth_user WHERE role='ADMIN' OR user_id=?`,
                      [`Payment received for ${order.order_no}, but the inventory hold is no longer active. Contact support to arrange fulfilment or a refund.`, order.user_id]);
                }
                return this.state(order, 'REVIEW');
            }
        }
        // A failed attempt is not a failed order: Cashfree allows retrying the same session.
        if (remote.order_status === 'EXPIRED' && !successes.length) {
            if (order.order_type === 'PREBOOK') await this.prebooks.failPending(order.order_id);
            else await this.orders.failPurchase(order.order_id);
            return this.state(order, 'EXPIRED');
        }
        return this.state(order, 'PENDING');
    }
    async verify(payload: any) { return this.respond(async () => {
        const order = await this.owned(payload);
        await new PaymentHistory(this.dao).event(order, 'VERIFICATION_REQUESTED', 'STARTED', {}, 'CUSTOMER');
        return this.sync(order);
    }); }

    // Called only by the ADMIN-protected router; the buyer API still requires ownership.
    async adminReconcile(payload: any) { return this.respond(async () => {
        const id = Number(payload.order_id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Order not found.');
        const query = await this.query('SELECT * FROM orders WHERE order_id=?', [id]);
        if (!query.rows?.[0]) throw new Error('Order not found.');
        const order = query.rows[0];
        await new PaymentHistory(this.dao).event({ ...order, user_id: payload.user_id }, 'VERIFICATION_REQUESTED', 'STARTED', {}, 'ADMIN');
        return this.sync(order);
    }); }

    async webhook(raw: string, signature: string, timestamp: string) {
        const history = new PaymentHistory(this.dao); const correlation = crypto.randomUUID();
        const hash = crypto.createHash('sha256').update(raw).digest('hex');
        const context: any = { environment: cashfreeMode() };
        if (!verifyCashfreeSignature(raw, signature, timestamp)) {
            try { await history.event(context, 'WEBHOOK_REJECTED', 'INVALID_SIGNATURE', { body_hash: hash, length: raw.length }, 'WEBHOOK', undefined, undefined, correlation); } catch {}
            return { status: -1, info: 'Invalid webhook signature.', httpStatus: 401 };
        }
        try {
            const body = JSON.parse(raw);
            context.gateway_order_id = body.data?.order?.order_id || body.data?.refund?.order_id;
            context.gateway_payment_id = body.data?.payment?.cf_payment_id ? String(body.data.payment.cf_payment_id) : undefined;
            context.gateway_refund_id = body.data?.refund?.refund_id || body.data?.refund_id;
            await history.event(context, 'WEBHOOK_RECEIVED', 'VERIFIED', { type: body.type, body_hash: hash, body }, 'WEBHOOK', undefined, undefined, correlation);
            if (body.type === 'REFUND_STATUS_WEBHOOK') {
                await this.prebooks.handleRefundWebhook(body.data?.refund?.refund_id || body.data?.refund_id);
            } else if (['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'].includes(body.type)) {
                const gatewayId = body.data?.order?.order_id;
                if (gatewayId) {
                    const q = await this.query("SELECT * FROM orders WHERE payment_provider='CASHFREE' AND gateway_environment=? AND gateway_order_id=?", [cashfreeMode(), gatewayId]);
                    const order = q.rows?.[0];
                    if (order) { context.order_id = order.order_id; await this.sync(order); }
                }
            }
            await history.event(context, 'WEBHOOK_PROCESSED', 'OK', { body_hash: hash }, 'WEBHOOK', undefined, undefined, correlation);
            return { status: 1, info: 'OK', httpStatus: 200 };
        } catch {
            try { await history.event(context, 'WEBHOOK_PROCESSING_ERROR', 'RETRY', { body_hash: hash }, 'WEBHOOK', undefined, undefined, correlation); } catch {}
            return { status: -33, info: 'Webhook processing delayed. Please retry.', httpStatus: 503 };
        }
    }
}
