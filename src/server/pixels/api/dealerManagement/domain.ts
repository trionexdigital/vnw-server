import { classifyNumber } from '../categories/categoryClassifier';
export const DM_PERMISSIONS = ['dealers.view', 'dealers.create', 'dealers.edit', 'stock.view', 'stock.upload', 'stock.edit', 'stock.price', 'stock.dealer', 'sales.view', 'sales.record', 'payments.view', 'payments.record', 'adjustments', 'audit.view'] as const;
export type Permission = typeof DM_PERMISSIONS[number];
export const MAX_CENTS = BigInt('9999999999999999');
export function cents(value: unknown, allowZero = false): bigint {
  const text = String(value ?? '').trim();
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a monetary amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (result > MAX_CENTS || result < (allowZero ? BigInt(0) : BigInt(1))) throw new Error('Monetary amount is out of range.');
  return result;
}
export function money(value: bigint): string {
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
}
export function total(values: unknown[]): string {
  const result = values.reduce<bigint>((sum, value) => sum + cents(value, true), BigInt(0));
  if (result > MAX_CENTS) throw new Error('Total exceeds the supported monetary limit.');
  return money(result);
}
export function id(value: unknown): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 4294967295) throw new Error('A valid record ID is required.');
  return result;
}
export function text(value: unknown, max = 1000, required = false): string {
  const result = String(value ?? '').trim();
  if (result.length > max || required && !result) throw new Error(`Enter ${required ? 'a value of ' : ''}at most ${max} characters.`);
  return result;
}
export function reason(value: unknown): string {
  const result = text(value, 1000, true);
  if (result.length < 5) throw new Error('Provide a reason of at least five characters.');
  return result;
}
export function choice(value: unknown, allowed: string[]): string {
  const v = String(value);
  if (!allowed.includes(v)) throw new Error(`Choose ${allowed.join(', ')}.`);
  return v;
}
export function dateTime(value: unknown): string {
  const s = String(value ?? '');
  if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d)?$/.test(s)) throw new Error('Enter a valid date and time.');
  const full = s.replace('T', ' ').padEnd(19, ':00');
  const d = new Date(full.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19).replace('T', ' ') !== full) throw new Error('Invalid calendar date.');
  return full;
}
export function stockValues(input: any): any {
  const number = text(input.number_value, 10, true);
  if (!/^[6-9]\d{9}$/.test(number)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  const readiness = choice(input.readiness, ['RTP', 'NON_RTP', 'RTA']);
  let rtpDate: string | null = null;
  if (readiness === 'NON_RTP') {
    rtpDate = text(input.rtp_date, 10, true);
    dateTime(`${rtpDate} 00:00:00`);
  }
  const digitTotal = number.split('').reduce((a, b) => a + Number(b), 0);
  const classification = classifyNumber(number);
  return {
    dealer_id: id(input.dealer_id),
    number_value: number,
    dealer_cost: money(cents(input.dealer_cost)),
    selling_price: money(cents(input.selling_price)),
    readiness,
    rtp_date: rtpDate,
    remarks: text(input.remarks),
    digit_total: digitTotal,
    root_sum: digitTotal === 0 ? 0 : 1 + (digitTotal - 1) % 9,
    patterns_json: JSON.stringify(classification.categories.map(c => c.name))
  };
}
export function financials(cost: unknown, sale: unknown, charges: unknown) {
  const c = cents(cost),
    s = cents(sale),
    f = cents(charges, true);
  return {
    dealer_cost: money(c),
    sale_price: money(s),
    charges: money(f),
    commission: money(s - c),
    profit: money(s - c - f)
  };
}
export function requireModulePermission(role: string, permissions: string[], permission: string) {
  if (role === 'ADMIN') return;
  if (role !== 'EMPLOYEE' || !permissions.includes(permission)) throw new Error('Forbidden: module permission required.');
}
export function ids(values: unknown): number[] {
  if (!Array.isArray(values) || !values.length || values.length > 1000) throw new Error('Select between 1 and 1,000 records.');
  const result = values.map(id);
  if (new Set(result).size !== result.length) throw new Error('Duplicate record selection.');
  return result.sort((a, b) => a - b);
}

// Each retained path is an exact combination in paise; pruning is explicitly disclosed.
export function suggestPayments(rows: Array<{
  sale_id: number;
  dealer_cost: string;
}>, targetValue: unknown, limit = 20000) {
  const target = cents(targetValue);
  let bounded = false;
  const candidates = [...rows].sort((a, b) => a.sale_id - b.sale_id);
  let states = new Map<string, {
    sum: bigint;
    ids: number[];
  }>([['0', {
    sum: BigInt(0),
    ids: []
  }]]);
  let work = 0;
  for (const row of candidates) {
    const amount = cents(row.dealer_cost);
    const next = new Map(states);
    for (const state of states.values()) {
      work++;
      const sum = state.sum + amount;
      if (!next.has(String(sum))) next.set(String(sum), {
        sum,
        ids: [...state.ids, row.sale_id]
      });
    }
    const exact = next.get(String(target));
    if (exact) return {
      bounded,
      exact: true,
      suggestions: [{
        sale_ids: exact.ids,
        total: money(target),
        difference: '0.00'
      }]
    };
    if (next.size > limit) {
      bounded = true;
      const distance = (s: bigint) => s > target ? s - target : target - s;
      const ordered = [...next.values()].sort((a, b) => distance(a.sum) < distance(b.sum) ? -1 : distance(a.sum) > distance(b.sum) ? 1 : a.ids.length - b.ids.length);
      states = new Map(ordered.slice(0, limit - 1).map(s => [String(s.sum), s]));
      states.set('0', {
        sum: BigInt(0),
        ids: []
      });
    } else states = next;
    if (work >= 200000) {
      bounded = true;
      break;
    }
  }
  const nonempty = [...states.values()].filter(s => s.ids.length);
  const lower = nonempty.filter(s => s.sum < target).sort((a, b) => a.sum > b.sum ? -1 : 1)[0];
  const upper = nonempty.filter(s => s.sum > target).sort((a, b) => a.sum < b.sum ? -1 : 1)[0];
  return {
    bounded,
    exact: false,
    suggestions: [lower, upper].filter(Boolean).map(s => ({
      sale_ids: s.ids,
      total: money(s.sum),
      difference: money(s.sum - target)
    }))
  };
}
