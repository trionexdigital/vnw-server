"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_ALL = void 0;
exports.getAuthUserId = getAuthUserId;
exports.requireAdmin = requireAdmin;
exports.requireRole = requireRole;
exports.getAuthUserRole = getAuthUserRole;
exports.getEffectivePermissions = getEffectivePermissions;
exports.getAuthIdentity = getAuthIdentity;
exports.hasPermission = hasPermission;
exports.requirePermission = requirePermission;
const database_1 = require("../gen_db/database");
const dao = new database_1.MySqlClient('pixels');
/**
 * Returns the authenticated user id bound by the auth middleware from the
 * verified JWT. Throws if absent — never trust a client-supplied user_id.
 */
function getAuthUserId(req) {
    const id = Number(req.authUserId);
    if (!id || id <= 0)
        throw new Error('Unauthorized: authentication required.');
    return id;
}
/** Verifies the authenticated user has the ADMIN role (checked against the DB). */
function requireAdmin(req) {
    return __awaiter(this, void 0, void 0, function* () {
        return requireRole(req, ['ADMIN']);
    });
}
/**
 * Verifies the authenticated user has one of the allowed roles (checked against
 * the DB — never trust a client-supplied role). Returns the user id on success.
 */
function requireRole(req, roles) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const id = getAuthUserId(req);
        const q = yield dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
        const role = (((_b = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.role) || '').toUpperCase();
        const allowed = roles.map((r) => r.toUpperCase());
        if (!allowed.includes(role)) {
            throw new Error(`Forbidden: requires one of [${allowed.join(', ')}] role.`);
        }
        return id;
    });
}
/** Returns the authenticated user's role (uppercased) from the DB. */
function getAuthUserRole(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const id = getAuthUserId(req);
        const q = yield dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
        return (((_b = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.role) || 'USER').toUpperCase();
    });
}
// ===================== RBAC: permission resolution =====================
/** Wildcard token meaning "all permissions" — held by ADMIN (and EMPLOYEE for UI visibility). */
exports.PERMISSION_ALL = '*';
/**
 * Resolves the effective permission keys for a user, combining role defaults
 * with per-user overrides (granted=1 adds, granted=0 revokes).
 *
 * ADMIN and EMPLOYEE resolve to ['*'] (full capability visibility). NOTE: an
 * EMPLOYEE's *writes* are still deferred to the admin approval queue at the
 * endpoint layer — the wildcard here only governs what they can see/attempt.
 */
function getEffectivePermissions(userId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let r = (role || '').toUpperCase();
        if (!r) {
            const q = yield dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [userId]);
            r = (((_b = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.role) || 'USER').toUpperCase();
        }
        if (r === 'ADMIN' || r === 'EMPLOYEE' || r === 'SYSTEM')
            return [exports.PERMISSION_ALL];
        const defaults = yield dao.executeQuery(`SELECT perm_key FROM role_default_permissions WHERE role = ?`, [r]);
        const overrides = yield dao.executeQuery(`SELECT perm_key, granted FROM user_permissions WHERE user_id = ?`, [userId]);
        const set = new Set((defaults.rows || []).map((x) => x.perm_key));
        for (const o of (overrides.rows || [])) {
            if (Number(o.granted) === 1)
                set.add(o.perm_key);
            else
                set.delete(o.perm_key);
        }
        return Array.from(set);
    });
}
/** Returns { id, role, permissions } for the authenticated user. */
function getAuthIdentity(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const id = getAuthUserId(req);
        const q = yield dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
        const role = (((_b = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.role) || 'USER').toUpperCase();
        const permissions = yield getEffectivePermissions(id, role);
        return { id, role, permissions };
    });
}
/** True if the effective permission set satisfies the required key. */
function hasPermission(permissions, key) {
    return permissions.includes(exports.PERMISSION_ALL) || permissions.includes(key);
}
/**
 * Verifies the authenticated user holds the given permission (ADMIN always
 * passes). Returns the user id on success, throws Forbidden otherwise.
 */
function requirePermission(req, key) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id, role, permissions } = yield getAuthIdentity(req);
        if (role === 'ADMIN')
            return id;
        if (!hasPermission(permissions, key)) {
            throw new Error(`Forbidden: requires '${key}' permission.`);
        }
        return id;
    });
}
//# sourceMappingURL=authContext.js.map