const integer = BigInt;
const ZERO = integer(0);
const MAX_MONEY = integer('999999999999999999'); // DECIMAL(18,2), in paise.

function decimalUnits(value: unknown, label: string, blankIsZero = false): bigint {
    if (blankIsZero && (value == null || String(value).trim() === '')) return ZERO;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${label} must be a decimal with at most two decimal places.`);
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) throw new Error(`${label} is outside the supported monetary range. Send large amounts as decimal strings.`);
    const text = String(value).trim();
    if (text.length > 24 || !/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`${label} must be a decimal with at most two decimal places.`);
    const [whole, fraction = ''] = text.split('.');
    return integer(whole) * integer(100) + integer(fraction.padEnd(2, '0'));
}

function round(numerator: bigint, denominator: bigint): bigint {
    return (numerator + denominator / integer(2)) / denominator;
}

function decimal(units: bigint): string {
    return `${units / integer(100)}.${String(units % integer(100)).padStart(2, '0')}`;
}

/** Authoritative catalog pricing. Neither discount stage rounds the other. */
export function calculateNumberPricing(baseValue: unknown, additionalValue: unknown = 0) {
    const base = decimalUnits(baseValue, 'Base price');
    const additional = decimalUnits(additionalValue, 'Additional discount', true);
    if (base <= ZERO || base > MAX_MONEY) throw new Error('Base price must be greater than zero and fit DECIMAL(18,2).');
    if (additional >= integer(10000)) throw new Error('Additional discount must be from 0% to below 100%.');
    const listed = round(base * integer(125), integer(100));
    const final = round(base * integer(125) * integer(95) * (integer(10000) - additional), integer(100000000));
    if (listed > MAX_MONEY || final > MAX_MONEY) throw new Error('Calculated price exceeds the supported monetary range.');
    if (final < integer(1)) throw new Error('Final customer price must be at least ₹0.01.');
    const effective = round(integer(100000000) - integer(9500) * (integer(10000) - additional), integer(10000));
    return { base_price: decimal(base), additional_discount_pct: decimal(additional), mrp: decimal(listed), offer_price: decimal(final), discount_pct: decimal(effective) };
}

/** A NULL base marks untouched legacy inventory; its original MRP is the base. */
export function resolveNumberPricing(input: any, current?: any) {
    let base = input.base_price;
    if (base === undefined) {
        if (current?.base_price != null) {
            if (input.mrp !== undefined && decimalUnits(input.mrp, 'Listed price') !== decimalUnits(current.mrp, 'Listed price')) {
                throw new Error('Use base_price to change pricing. mrp is the calculated website listed price.');
            }
            base = current.base_price;
        } else base = input.mrp ?? current?.mrp;
    }
    const additional = input.additional_discount_pct === undefined ? current?.additional_discount_pct ?? 0 : input.additional_discount_pct;
    return calculateNumberPricing(base, additional);
}
