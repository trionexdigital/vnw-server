export const isIndianPin = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{5}$/.test(value);

export function normalizeServiceablePins(value: unknown, required = false): string[] {
    const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\s]+/).filter(Boolean) : value == null ? [] : [value];
    const pins = [...new Set(entries.map(item => String(item).trim()))];
    if (pins.length > 1000 || pins.some(pin => !isIndianPin(pin))) throw new Error('Use valid six-digit PIN codes beginning with 1–9 (maximum 1,000).');
    if (required && !pins.length) throw new Error('RTA numbers require at least one serviceable PIN code.');
    return pins;
}

export async function saveServiceablePins(connection: any, numberId: number, pins: string[]) {
    await connection.query('DELETE FROM vip_number_serviceable_pins WHERE number_id=?', [numberId]);
    if (pins.length) await connection.query(`INSERT INTO vip_number_serviceable_pins (number_id,pin_code) VALUES ${pins.map(() => '(?,?)').join(',')}`, pins.flatMap(pin => [numberId, pin]));
}

/** Used only by public discovery. Internal inventory calls are explicitly trusted by the caller. */
export function rtaDiscoveryPredicate(payload: any): { where: string[]; params: string[] } {
    if (payload.rtp_status !== 'RTA') return { where: ["n.rtp_status <> 'RTA'"], params: [] };
    if (payload.show_all_rta === true) return { where: [], params: [] };
    if (payload.pin_code == null || payload.pin_code === '') return { where: ['1=0'], params: [] };
    if (!isIndianPin(payload.pin_code)) throw new Error('Enter a valid six-digit PIN code.');
    return { where: ['EXISTS (SELECT 1 FROM vip_number_serviceable_pins sp WHERE sp.number_id=n.number_id AND sp.pin_code=?)'], params: [payload.pin_code] };
}
