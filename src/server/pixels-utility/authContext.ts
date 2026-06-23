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
