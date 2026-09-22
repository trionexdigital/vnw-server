export const GLOBAL_DISCOUNT_KEY = 'GLOBAL_NUMBER_DISCOUNT_PERCENT';

export function normalizeGlobalDiscount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(99, Math.max(0, Math.round(parsed)));
}

export function discountedPrice(mrpValue: unknown, discountValue: unknown): number {
    const mrp = Math.max(0, Number(mrpValue) || 0);
    const discount = normalizeGlobalDiscount(discountValue);
    return Math.round((mrp * (100 - discount))) / 100;
}

export async function readGlobalDiscount(connection: any): Promise<number> {
    const [rows]: any = await connection.query(
        'SELECT value FROM env WHERE key_id=? LIMIT 1',
        [GLOBAL_DISCOUNT_KEY],
    );
    return normalizeGlobalDiscount(rows?.[0]?.value);
}

