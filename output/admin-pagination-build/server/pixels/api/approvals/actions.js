"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIONS = void 0;
exports.isValidAction = isValidAction;
const admin_1 = require("../admin/admin");
const sell_1 = require("../sell/sell");
const admin = new admin_1.Admin();
const sell = new sell_1.Sell();
exports.ACTIONS = {
    'numbers.save': {
        label: 'Save number',
        summary: (p) => p.number_id ? `Update number #${p.number_id}` : `Create number "${p.display_number || p.number_value}"`,
        execute: (p, a) => admin.numberSave(Object.assign(Object.assign({}, p), { user_id: a })),
    },
    'numbers.delete': {
        label: 'Delete number',
        summary: (p) => `Delete number #${p.number_id}`,
        execute: (p) => admin.numberDelete(p),
    },
    'numbers.approve': {
        label: 'Approve listing',
        summary: (p) => `Approve listing #${p.number_id}`,
        execute: (p) => admin.numberApprove(p),
    },
    'numbers.reject': {
        label: 'Reject listing',
        summary: (p) => `Reject listing #${p.number_id}`,
        execute: (p) => admin.numberReject(p),
    },
    'orders.update-status': {
        label: 'Update order status',
        summary: (p) => `Set order #${p.order_id} → ${p.status}`,
        execute: (p) => admin.orderUpdateStatus(p),
    },
    'users.set-status': {
        label: 'Update user status',
        summary: (p) => `Set user #${p.target_id} → ${p.status}`,
        execute: (p) => admin.userSetStatus(p),
    },
    'users.set-role': {
        label: 'Update user role',
        summary: (p) => `Set user #${p.target_id} → ${p.role}`,
        execute: (p) => admin.userSetRole(p),
    },
    'sell.approve': {
        label: 'Approve sell request',
        summary: (p) => `Approve sell request #${p.request_id}`,
        execute: (p, a) => sell.approve(Object.assign(Object.assign({}, p), { user_id: a })),
    },
    'sell.reject': {
        label: 'Reject sell request',
        summary: (p) => `Reject sell request #${p.request_id}`,
        execute: (p, a) => sell.reject(Object.assign(Object.assign({}, p), { user_id: a })),
    },
    'coupons.save': {
        label: 'Save coupon',
        summary: (p) => p.coupon_id ? `Update coupon #${p.coupon_id}` : `Create coupon "${p.code}"`,
        execute: (p) => admin.couponSave(p),
    },
    'coupons.delete': {
        label: 'Delete coupon',
        summary: (p) => `Delete coupon #${p.coupon_id}`,
        execute: (p) => admin.couponDelete(p),
    },
};
function isValidAction(key) {
    return Object.prototype.hasOwnProperty.call(exports.ACTIONS, key);
}
//# sourceMappingURL=actions.js.map