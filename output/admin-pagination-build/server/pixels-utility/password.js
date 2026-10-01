"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.isLegacyPassword = isLegacyPassword;
const crypto_1 = require("crypto");
// Strong, long salted scrypt hash. Passwords are ONLY ever stored as this hash.
// Format: "scrypt$<salt hex 32>$<key hex 128>"  ->  ~168 chars (column is varchar(512)).
const PREFIX = 'scrypt';
const SALT_BYTES = 16; // 128-bit salt
const KEY_BYTES = 64; // 512-bit derived key
/** Produces a strong salted scrypt hash: "scrypt$<salt>$<key>". */
function hashPassword(password) {
    const salt = (0, crypto_1.randomBytes)(SALT_BYTES).toString('hex');
    const key = (0, crypto_1.scryptSync)(String(password), salt, KEY_BYTES).toString('hex');
    return `${PREFIX}$${salt}$${key}`;
}
/**
 * Constant-time verification.
 *  - "scrypt$" : current strong hash.
 *  - "s2$"     : earlier compact hash (still verifiable).
 *  - otherwise : legacy plaintext (read-only) so pre-hash accounts can still sign in;
 *                the caller re-hashes and persists on success (see userLogin upgrade).
 */
function verifyPassword(password, stored) {
    if (!stored)
        return false;
    if (stored.startsWith(PREFIX + '$')) {
        const parts = stored.split('$');
        const salt = parts[1];
        const keyHex = parts[2];
        if (!salt || !keyHex)
            return false;
        const candidate = (0, crypto_1.scryptSync)(String(password), salt, KEY_BYTES);
        const expected = Buffer.from(keyHex, 'hex');
        return expected.length === candidate.length && (0, crypto_1.timingSafeEqual)(expected, candidate);
    }
    if (stored.startsWith('s2$')) {
        const [, salt, keyStr] = stored.split('$');
        if (!salt || !keyStr)
            return false;
        const candidate = (0, crypto_1.scryptSync)(String(password), salt, 24)
            .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const a = Buffer.from(candidate);
        const b = Buffer.from(keyStr);
        return a.length === b.length && (0, crypto_1.timingSafeEqual)(a, b);
    }
    // Legacy plaintext fallback (auto-upgraded to a hash on next successful login).
    return stored === password;
}
/** True if the stored value is not yet a hash and should be upgraded on successful login. */
function isLegacyPassword(stored) {
    return !!stored && !stored.startsWith(PREFIX + '$') && !stored.startsWith('s2$');
}
//# sourceMappingURL=password.js.map