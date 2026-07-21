import { Admin } from '../admin/admin';
import { Sell } from '../sell/sell';

/**
 * Shared registry of admin-level actions that an EMPLOYEE may *request* but
 * never execute directly. The same executor is used both to validate an
 * employee submission and to replay it when an ADMIN approves the request.
 *
 * `execute(payload, actorId)` runs the real mutation, attributing it to the
 * approving admin (actorId).
 */
export interface ActionDef {
    label: string;
    summary: (p: any) => string;
    execute: (p: any, actorId: number) => Promise<any>;
}

const admin = new Admin();
const sell = new Sell();

export const ACTIONS: Record<string, ActionDef> = {
    'numbers.save': {
        label: 'Save number',
        summary: (p) => p.number_id ? `Update number #${p.number_id}` : `Create number "${p.display_number || p.number_value}"`,
        execute: (p, a) => admin.numberSave({ ...p, user_id: a }),
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
        execute: (p, a) => sell.approve({ ...p, user_id: a }),
    },
    'sell.reject': {
        label: 'Reject sell request',
        summary: (p) => `Reject sell request #${p.request_id}`,
        execute: (p, a) => sell.reject({ ...p, user_id: a }),
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

export function isValidAction(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(ACTIONS, key);
}
