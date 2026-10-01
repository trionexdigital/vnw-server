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
exports.Wallet = void 0;
exports.creditWallet = creditWallet;
exports.debitWallet = debitWallet;
exports.getBalance = getBalance;
exports.reverseWithdrawal = reverseWithdrawal;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const notifications_1 = require("../notifications/notifications");
const dao = new database_1.MySqlClient('pixels');
const logger = new Logger_1.Logger();
/** Ensures a wallet row exists for the user (idempotent). */
function ensureWallet(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield dao.executeQuery(`INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)`, [userId]);
    });
}
/**
 * Credits a wallet. Idempotent when (source, reference_type, reference_id) is
 * provided — the unique key blocks a duplicate ledger row, so a retried sale /
 * approval never double-credits. Returns true if a credit was actually applied.
 */
function creditWallet(userId, amount, source, referenceType, referenceId, description) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const amt = Number(Number(amount).toFixed(2));
        if (!userId || !(amt > 0))
            return false;
        try {
            yield ensureWallet(userId);
            // Guard idempotency: skip if a matching ledger entry already exists.
            if (referenceId != null) {
                const dup = yield dao.executeQuery(`SELECT txn_id FROM wallet_transactions WHERE source = ? AND reference_type = ? AND reference_id = ? LIMIT 1`, [source, referenceType, referenceId]);
                if (dup.rows && dup.rows.length > 0)
                    return false;
            }
            yield dao.executeQuery(`UPDATE wallets SET balance = balance + ?, total_credited = total_credited + ? WHERE user_id = ?`, [amt, amt, userId]);
            const balQ = yield dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
            const balanceAfter = Number((_c = (_b = (_a = balQ.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.balance) !== null && _c !== void 0 ? _c : 0);
            yield dao.executeQuery(`INSERT INTO wallet_transactions (user_id, direction, amount, balance_after, source, reference_type, reference_id, description)
             VALUES (?, 'CREDIT', ?, ?, ?, ?, ?, ?)`, [userId, amt, balanceAfter, source, referenceType, referenceId, description.slice(0, 255)]);
            return true;
        }
        catch (e) {
            logger.error('creditWallet failed: ' + e);
            return false;
        }
    });
}
/**
 * Debits a wallet (throws if insufficient balance). Used for withdrawals.
 * Returns the new balance.
 */
function debitWallet(userId, amount, source, referenceType, referenceId, description) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const amt = Number(Number(amount).toFixed(2));
        if (!(amt > 0))
            throw new Error('Amount must be greater than zero.');
        yield ensureWallet(userId);
        const balQ = yield dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
        const balance = Number((_c = (_b = (_a = balQ.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.balance) !== null && _c !== void 0 ? _c : 0);
        if (amt > balance)
            throw new Error('Insufficient wallet balance.');
        yield dao.executeQuery(`UPDATE wallets SET balance = balance - ?, total_debited = total_debited + ? WHERE user_id = ?`, [amt, amt, userId]);
        const balanceAfter = Number((balance - amt).toFixed(2));
        yield dao.executeQuery(`INSERT INTO wallet_transactions (user_id, direction, amount, balance_after, source, reference_type, reference_id, description)
         VALUES (?, 'DEBIT', ?, ?, ?, ?, ?, ?)`, [userId, amt, balanceAfter, source, referenceType, referenceId, description.slice(0, 255)]);
        return balanceAfter;
    });
}
/** Returns the current wallet balance (0 if none yet). */
function getBalance(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const q = yield dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
        return Number((_c = (_b = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.balance) !== null && _c !== void 0 ? _c : 0);
    });
}
class Wallet {
    constructor() { this.dao = new database_1.MySqlClient('pixels'); this.masterModel = new MasterModel_1.MasterModel(); }
    /** Wallet balance + totals + recent transactions for the authenticated user. */
    summary(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let resModel = this.masterModel.getResponseModel();
            try {
                yield ensureWallet(payload.user_id);
                const w = yield this.dao.executeQuery(`SELECT balance, total_credited, total_debited FROM wallets WHERE user_id = ?`, [payload.user_id]);
                const t = yield this.dao.executeQuery(`SELECT txn_id, direction, amount, balance_after, source, description, created_at
                 FROM wallet_transactions WHERE user_id = ? ORDER BY txn_id DESC LIMIT 50`, [payload.user_id]);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = Object.assign(Object.assign({}, (((_a = w.rows) === null || _a === void 0 ? void 0 : _a[0]) || { balance: 0, total_credited: 0, total_debited: 0 })), { transactions: t.rows || [] });
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
    /**
     * Withdrawal request for any wallet holder. Debits the wallet immediately
     * (reserving the funds) and records a PENDING payout for admin processing.
     */
    withdraw(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const amount = Number(payload.amount);
                if (!amount || amount <= 0)
                    throw new Error('Enter a valid withdrawal amount.');
                yield debitWallet(payload.user_id, amount, 'WITHDRAWAL', 'withdrawal', null, 'Withdrawal request');
                const ins = yield this.dao.executeQuery(`INSERT INTO dealer_payouts (dealer_id, amount, status) VALUES (?,?, 'PENDING')`, [payload.user_id, amount]);
                // Tie the reversal reference to this payout row.
                yield this.dao.executeQuery(`UPDATE wallet_transactions SET reference_id = ? WHERE user_id = ? AND source = 'WITHDRAWAL' AND reference_id IS NULL ORDER BY txn_id DESC LIMIT 1`, [ins.insertId, payload.user_id]);
                resModel.status = 1;
                resModel.info = 'Withdrawal requested.';
                resModel.data = { payout_id: ins.insertId, balance: yield getBalance(payload.user_id) };
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Wallet = Wallet;
/** Reverses a withdrawal back into the wallet (used when admin rejects a payout). */
function reverseWithdrawal(payoutId, userId, amount) {
    return __awaiter(this, void 0, void 0, function* () {
        const ok = yield creditWallet(userId, amount, 'WITHDRAWAL_REVERSAL', 'payout', payoutId, 'Withdrawal rejected — refunded');
        if (ok)
            yield (0, notifications_1.pushNotification)({ user_id: userId, type: 'wallet', title: 'Withdrawal refunded', message: `₹${amount} was returned to your wallet.` });
    });
}
//# sourceMappingURL=wallet.js.map