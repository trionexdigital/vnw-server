import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { getEffectivePermissions } from '../../../pixels-utility/authContext';

export class Rbac {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Full grantable permission catalog (admin). */
    async catalog(_payload: any) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT perm_key, module, label, description, sort_order FROM permissions ORDER BY module, sort_order`, []);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = q.rows || [];
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /** The authenticated caller's own effective permissions (any role). */
    async myPermissions(payload: { user_id: number, role?: string }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const perms = await getEffectivePermissions(Number(payload.user_id), payload.role);
            resModel.status = 1; resModel.info = 'OK'; resModel.data = { permissions: perms };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /** A target user's effective permissions + raw per-user overrides (admin). */
    async getUserPermissions(payload: { target_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.target_id);
            if (!id) throw new Error('target_id is required.');
            const u: any = await this.dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
            if (u.fetchedRows === 0) throw new Error('User not found.');
            const role = (u.rows[0].role || 'USER').toUpperCase();
            const overrides: any = await this.dao.executeQuery(
                `SELECT perm_key, granted FROM user_permissions WHERE user_id = ?`, [id]);
            const effective = await getEffectivePermissions(id, role);
            resModel.status = 1; resModel.info = 'OK';
            resModel.data = { user_id: id, role, effective, overrides: overrides.rows || [] };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /**
     * Replaces a user's explicit permission grants (admin). Used to map DEALER
     * permissions during/after account creation. `permissions` is the full set
     * of perm_keys the user should hold; anything not listed is revoked.
     */
    async setUserPermissions(payload: { target_id: number, permissions: string[], granted_by: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const id = Number(payload.target_id);
            if (!id) throw new Error('target_id is required.');
            const list = Array.isArray(payload.permissions) ? payload.permissions : [];

            // Validate keys against the catalog to avoid storing junk grants.
            const cat: any = await this.dao.executeQuery(`SELECT perm_key FROM permissions`, []);
            const valid = new Set<string>((cat.rows || []).map((x: any) => x.perm_key));
            const clean = Array.from(new Set(list.filter((k) => valid.has(k))));

            // Reset and re-insert explicit grants (granted=1).
            await this.dao.executeQuery(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);
            for (const key of clean) {
                await this.dao.executeQuery(
                    `INSERT INTO user_permissions (user_id, perm_key, granted, granted_by) VALUES (?,?,1,?)`,
                    [id, key, Number(payload.granted_by) || null]);
            }
            const effective = await getEffectivePermissions(id);
            resModel.status = 1; resModel.info = 'Permissions updated.'; resModel.data = { effective };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
}
