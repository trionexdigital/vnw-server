import { Request } from 'express';
import { MySqlClient } from '../gen_db/database';

const dao = new MySqlClient('pixels');

/**
 * Returns the authenticated user id bound by the auth middleware from the
 * verified JWT. Throws if absent — never trust a client-supplied user_id.
 */
export function getAuthUserId(req: Request): number {
    const id = Number((req as any).authUserId);
    if (!id || id <= 0) throw new Error('Unauthorized: authentication required.');
    return id;
}

/** Verifies the authenticated user has the ADMIN role (checked against the DB). */
export async function requireAdmin(req: Request): Promise<number> {
    return requireRole(req, ['ADMIN']);
}

/**
 * Verifies the authenticated user has one of the allowed roles (checked against
 * the DB — never trust a client-supplied role). Returns the user id on success.
 */
export async function requireRole(req: Request, roles: string[]): Promise<number> {
    const id = getAuthUserId(req);
    const q: any = await dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
    const role = (q.rows?.[0]?.role || '').toUpperCase();
    const allowed = roles.map((r) => r.toUpperCase());
    if (!allowed.includes(role)) {
        throw new Error(`Forbidden: requires one of [${allowed.join(', ')}] role.`);
    }
    return id;
}

/** Returns the authenticated user's role (uppercased) from the DB. */
export async function getAuthUserRole(req: Request): Promise<string> {
    const id = getAuthUserId(req);
    const q: any = await dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
    return (q.rows?.[0]?.role || 'USER').toUpperCase();
}

// ===================== RBAC: permission resolution =====================

/** Wildcard token meaning "all permissions" — held by ADMIN (and EMPLOYEE for UI visibility). */
export const PERMISSION_ALL = '*';

/**
 * Resolves the effective permission keys for a user, combining role defaults
 * with per-user overrides (granted=1 adds, granted=0 revokes).
 *
 * ADMIN and EMPLOYEE resolve to ['*'] (full capability visibility). NOTE: an
 * EMPLOYEE's *writes* are still deferred to the admin approval queue at the
 * endpoint layer — the wildcard here only governs what they can see/attempt.
 */
export async function getEffectivePermissions(userId: number, role?: string): Promise<string[]> {
    let r = (role || '').toUpperCase();
    if (!r) {
        const q: any = await dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [userId]);
        r = (q.rows?.[0]?.role || 'USER').toUpperCase();
    }
    if (r === 'ADMIN' || r === 'EMPLOYEE' || r === 'SYSTEM') return [PERMISSION_ALL];

    const defaults: any = await dao.executeQuery(
        `SELECT perm_key FROM role_default_permissions WHERE role = ?`, [r]);
    const overrides: any = await dao.executeQuery(
        `SELECT perm_key, granted FROM user_permissions WHERE user_id = ?`, [userId]);

    const set = new Set<string>((defaults.rows || []).map((x: any) => x.perm_key));
    for (const o of (overrides.rows || [])) {
        if (Number(o.granted) === 1) set.add(o.perm_key);
        else set.delete(o.perm_key);
    }
    return Array.from(set);
}

/** Returns { id, role, permissions } for the authenticated user. */
export async function getAuthIdentity(req: Request): Promise<{ id: number; role: string; permissions: string[] }> {
    const id = getAuthUserId(req);
    const q: any = await dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
    const role = (q.rows?.[0]?.role || 'USER').toUpperCase();
    const permissions = await getEffectivePermissions(id, role);
    return { id, role, permissions };
}

/** True if the effective permission set satisfies the required key. */
export function hasPermission(permissions: string[], key: string): boolean {
    return permissions.includes(PERMISSION_ALL) || permissions.includes(key);
}

/**
 * Verifies the authenticated user holds the given permission (ADMIN always
 * passes). Returns the user id on success, throws Forbidden otherwise.
 */
export async function requirePermission(req: Request, key: string): Promise<number> {
    const { id, role, permissions } = await getAuthIdentity(req);
    if (role === 'ADMIN') return id;
    if (!hasPermission(permissions, key)) {
        throw new Error(`Forbidden: requires '${key}' permission.`);
    }
    return id;
}
