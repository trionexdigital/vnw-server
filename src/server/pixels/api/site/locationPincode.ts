import axios from 'axios';
import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { isIndianPin } from '../numbers/serviceablePins';
import { Logger } from '../../../pixels-utility/Logger';

type LocationResult = { pin_code: string | null; reason?: 'INVALID_COORDINATES' | 'BUSY' | 'UNAVAILABLE' | 'NO_INDIAN_PIN' };

export class LocationPincode {
    private dao = new MySqlClient('pixels');
    private logger = new Logger();

    async lookup(payload: any) {
        const response = { ...new MasterModel().getResponseModel(), data: { pin_code: null } as LocationResult };
        let data: LocationResult = { pin_code: null, reason: 'UNAVAILABLE' };
        try {
            const { latitude, longitude } = payload || {};
            if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
                data = { pin_code: null, reason: 'INVALID_COORDINATES' };
            } else {
                // Only a rounded location is sent upstream; no profile, IP, or identity is forwarded.
                const lat = latitude.toFixed(4), lon = longitude.toFixed(4);
                const base = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
                const key = createHash('sha256').update(`${base}:${lat}:${lon}`).digest('hex');
                const cached: any = await this.dao.executeQuery('SELECT pin_code FROM location_geocode_cache WHERE location_key=? AND expires_at>UTC_TIMESTAMP(3)', [key]);
                if (cached.status !== 1) {
                    this.logger.error('GPS PIN lookup: database cache unavailable. Check database connectivity and the RTA location migration.');
                    throw new Error('Cache unavailable');
                }
                if (cached.rows?.length) {
                    data = { pin_code: cached.rows[0].pin_code, ...(cached.rows[0].pin_code ? {} : { reason: 'NO_INDIAN_PIN' as const }) };
                } else {
                    // Atomic across processes/hosts sharing this database. No queue or automatic retries.
                    // Repair a missing seed row without running schema changes in the application.
                    const seed: any = await this.dao.executeQuery("INSERT IGNORE INTO location_geocode_throttle(service,next_request_at) VALUES ('nominatim','2000-01-01')", []);
                    if (seed.status !== 1) throw new Error('Throttle unavailable');
                    const gate: any = await this.dao.executeQuery("UPDATE location_geocode_throttle SET next_request_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1100000 MICROSECOND) WHERE service='nominatim' AND next_request_at<=UTC_TIMESTAMP(3)", []);
                    if (gate.status !== 1) throw new Error('Throttle unavailable');
                    if (gate.affectedRows !== 1) data = { pin_code: null, reason: 'BUSY' };
                    else {
                        const result = await axios.get(`${base.replace(/\/$/, '')}/reverse`, {
                            params: { lat, lon, format: 'jsonv2', addressdetails: 1, layer: 'address', 'accept-language': 'en' },
                            headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'VIPNumberWorld/1.0 (https://vipnumberworld.com)' },
                            timeout: 8000,
                            maxRedirects: 0,
                        });
                        const address = result.data?.address;
                        if (!address || typeof address.country_code !== 'string') throw new Error('Invalid geocoder response');
                        const pin = typeof address?.postcode === 'string' ? address.postcode.trim() : '';
                        const valid = address?.country_code === 'in' && isIndianPin(pin);
                        data = { pin_code: valid ? pin : null, ...(valid ? {} : { reason: 'NO_INDIAN_PIN' as const }) };
                        await this.dao.executeQuery(`INSERT INTO location_geocode_cache(location_key,pin_code,expires_at)
                            VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ${valid ? 86400 : 300} SECOND))
                            ON DUPLICATE KEY UPDATE pin_code=VALUES(pin_code),expires_at=VALUES(expires_at)`, [key, data.pin_code]);
                        await this.dao.executeQuery('DELETE FROM location_geocode_cache WHERE expires_at<UTC_TIMESTAMP(3) LIMIT 100', []);
                    }
                }
            }
        } catch {
            // Do not log the thrown Axios error: its configuration includes the coordinates.
            this.logger.error('GPS PIN lookup unavailable. No coordinates or provider request details were logged.');
        }
        response.status = 1; response.info = 'OK'; response.data = data;
        return response;
    }
}
