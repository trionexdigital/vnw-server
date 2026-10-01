export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Prices and rates are obtained by the server; never trust a browser total. */
export function calculateBilling(items: any[], gstRate: unknown, coupon?: any, now = new Date()) {
    const gst_percent = Number(gstRate ?? 0);
    if (!Number.isFinite(gst_percent) || gst_percent < 0 || gst_percent > 100 || Math.abs(gst_percent * 100 - Math.round(gst_percent * 100)) > .000001) throw new Error('GST setting is invalid. Please contact support.');
    const subtotal = money(items.reduce((sum, n) => sum + Number(n.offer_price), 0));
    const mrp_total = money(items.reduce((sum, n) => sum + Math.max(Number(n.mrp ?? n.offer_price), Number(n.offer_price)), 0));
    if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Catalog pricing is invalid.');
    let discount = 0;
    if (coupon) {
        const expires = coupon.expires_at instanceof Date ? coupon.expires_at.toISOString().slice(0, 10) : String(coupon.expires_at || '').slice(0, 10);
        if (!Number(coupon.is_active) || (expires && expires < now.toISOString().slice(0, 10))) throw new Error('This coupon is inactive or expired.');
        if (coupon.usage_limit != null && Number(coupon.used_count || 0) >= Number(coupon.usage_limit)) throw new Error('This coupon has reached its usage limit.');
        if (subtotal < Number(coupon.min_order || 0)) throw new Error(`This coupon requires a minimum order of ₹${coupon.min_order}.`);
        discount = coupon.type === 'PERCENT' ? subtotal * Number(coupon.value) / 100 : Number(coupon.value);
        if (coupon.max_discount != null && Number(coupon.max_discount) > 0) discount = Math.min(discount, Number(coupon.max_discount));
        if (!Number.isFinite(discount) || discount < 0) throw new Error('This coupon is invalid.');
        discount = money(Math.min(discount, subtotal));
    }
    const taxable_amount = money(subtotal - discount);
    const gst_amount = money(taxable_amount * gst_percent / 100);
    return { mrp_total, offer_savings: money(mrp_total - subtotal), subtotal, discount, taxable_amount, gst_percent, gst_amount, total: money(taxable_amount + gst_amount), coupon_code: coupon?.code || null };
}

export async function loadBilling(connection: any, items: any[], couponCode?: string) {
    const [settings]: any = await connection.query("SELECT value FROM env WHERE key_id='GST_PERCENT' LIMIT 1");
    let coupon: any;
    if (couponCode?.trim()) {
        const [coupons]: any = await connection.query('SELECT * FROM coupons WHERE code=? AND is_active=1 FOR UPDATE', [couponCode.trim().toUpperCase()]);
        coupon = coupons?.[0];
        if (!coupon) throw new Error('Coupon code was not found or is inactive.');
        if (coupon.usage_limit != null) {
            // A locking read sees orders committed while this transaction waited for the coupon lock.
            const [usage]: any = await connection.query("SELECT order_id FROM orders WHERE coupon_code=? AND (payment_status='PAID' OR (payment_status='UNPAID' AND status='PENDING' AND payment_expires_at>UTC_TIMESTAMP())) LIMIT ? FOR UPDATE", [coupon.code, Math.max(1, Number(coupon.usage_limit))]);
            coupon.used_count = Math.max(Number(coupon.used_count || 0), usage?.length || 0);
        }
    }
    return calculateBilling(items, settings?.[0]?.value || 0, coupon);
}
