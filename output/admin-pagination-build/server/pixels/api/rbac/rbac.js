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
exports.Rbac = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const authContext_1 = require("../../../pixels-utility/authContext");
class Rbac {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Full grantable permission catalog (admin). */
    catalog(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT perm_key, module, label, description, sort_order FROM permissions ORDER BY module, sort_order`, []);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** The authenticated caller's own effective permissions (any role). */
    myPermissions(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const perms = yield (0, authContext_1.getEffectivePermissions)(Number(payload.user_id), payload.role);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { permissions: perms };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /** A target user's effective permissions + raw per-user overrides (admin). */
    getUserPermissions(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const id = Number(payload.target_id);
                if (!id)
                    throw new Error('target_id is required.');
                const u = yield this.dao.executeQuery(`SELECT role FROM auth_user WHERE user_id = ?`, [id]);
                if (u.fetchedRows === 0)
                    throw new Error('User not found.');
                const role = (u.rows[0].role || 'USER').toUpperCase();
                const overrides = yield this.dao.executeQuery(`SELECT perm_key, granted FROM user_permissions WHERE user_id = ?`, [id]);
                const effective = yield (0, authContext_1.getEffectivePermissions)(id, role);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = { user_id: id, role, effective, overrides: overrides.rows || [] };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /**
     * Replaces a user's explicit permission grants (admin). Used to map DEALER
     * permissions during/after account creation. `permissions` is the full set
     * of perm_keys the user should hold; anything not listed is revoked.
     */
    setUserPermissions(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const id = Number(payload.target_id);
                if (!id)
                    throw new Error('target_id is required.');
                const list = Array.isArray(payload.permissions) ? payload.permissions : [];
                // Validate keys against the catalog to avoid storing junk grants.
                const cat = yield this.dao.executeQuery(`SELECT perm_key FROM permissions`, []);
                const valid = new Set((cat.rows || []).map((x) => x.perm_key));
                const clean = Array.from(new Set(list.filter((k) => valid.has(k))));
                // Reset and re-insert explicit grants (granted=1).
                yield this.dao.executeQuery(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);
                for (const key of clean) {
                    yield this.dao.executeQuery(`INSERT INTO user_permissions (user_id, perm_key, granted, granted_by) VALUES (?,?,1,?)`, [id, key, Number(payload.granted_by) || null]);
                }
                const effective = yield (0, authContext_1.getEffectivePermissions)(id);
                resModel.status = 1;
                resModel.info = 'Permissions updated.';
                resModel.data = { effective };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Rbac = Rbac;
//# sourceMappingURL=rbac.js.map