import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';

export type WalletSource = 'SALE' | 'SELL_PAYOUT' | 'WITHDRAWAL' | 'WITHDRAWAL_REVERSAL' | 'REFERRAL' | 'ADJUSTMENT';

const dao = new MySqlClient('pixels');
const logger = new Logger();

/** Ensures a wallet row exists for the user (idempotent). */
async function ensureWallet(userId: number): Promise<void> {
    await dao.executeQuery(`INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)`, [userId]);
}

/**
 * Credits a wallet. Idempotent when (source, reference_type, reference_id) is
 * provided — the unique key blocks a duplicate ledger row, so a retried sale /
 * approval never double-credits. Returns true if a credit was actually applied.
 */
export async function creditWallet(
    userId: number, amount: number, source: WalletSource,
    referenceType: string | null, referenceId: number | null, description: string,
): Promise<boolean> {
    const amt = Number(Number(amount).toFixed(2));
    if (!userId || !(amt > 0)) return false;
    try {
        await ensureWallet(userId);
        // Guard idempotency: skip if a matching ledger entry already exists.
        if (referenceId != null) {
            const dup: any = await dao.executeQuery(
                `SELECT txn_id FROM wallet_transactions WHERE source = ? AND reference_type = ? AND reference_id = ? LIMIT 1`,
                [source, referenceType, referenceId]);
            if (dup.rows && dup.rows.length > 0) return false;
        }
        await dao.executeQuery(
            `UPDATE wallets SET balance = balance + ?, total_credited = total_credited + ? WHERE user_id = ?`,
            [amt, amt, userId]);
        const balQ: any = await dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
        const balanceAfter = Number(balQ.rows?.[0]?.balance ?? 0);
        await dao.executeQuery(
            `INSERT INTO wallet_transactions (user_id, direction, amount, balance_after, source, reference_type, reference_id, description)
             VALUES (?, 'CREDIT', ?, ?, ?, ?, ?, ?)`,
            [userId, amt, balanceAfter, source, referenceType, referenceId, description.slice(0, 255)]);
        return true;
    } catch (e) { logger.error('creditWallet failed: ' + e); return false; }
}

/**
 * Debits a wallet (throws if insufficient balance). Used for withdrawals.
 * Returns the new balance.
 */
export async function debitWallet(
    userId: number, amount: number, source: WalletSource,
    referenceType: string | null, referenceId: number | null, description: string,
): Promise<number> {
    const amt = Number(Number(amount).toFixed(2));
    if (!(amt > 0)) throw new Error('Amount must be greater than zero.');
    await ensureWallet(userId);
    const balQ: any = await dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
    const balance = Number(balQ.rows?.[0]?.balance ?? 0);
    if (amt > balance) throw new Error('Insufficient wallet balance.');
    await dao.executeQuery(
        `UPDATE wallets SET balance = balance - ?, total_debited = total_debited + ? WHERE user_id = ?`,
        [amt, amt, userId]);
    const balanceAfter = Number((balance - amt).toFixed(2));
    await dao.executeQuery(
        `INSERT INTO wallet_transactions (user_id, direction, amount, balance_after, source, reference_type, reference_id, description)
         VALUES (?, 'DEBIT', ?, ?, ?, ?, ?, ?)`,
        [userId, amt, balanceAfter, source, referenceType, referenceId, description.slice(0, 255)]);
    return balanceAfter;
}

/** Returns the current wallet balance (0 if none yet). */
export async function getBalance(userId: number): Promise<number> {
    const q: any = await dao.executeQuery(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
    return Number(q.rows?.[0]?.balance ?? 0);
}

export class Wallet {
    private dao: MySqlClient;
    private masterModel: MasterModel;
    constructor() { this.dao = new MySqlClient('pixels'); this.masterModel = new MasterModel(); }

    /** Wallet balance + totals + recent transactions for the authenticated user. */
    async summary(payload: { user_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            await ensureWallet(payload.user_id);
            const w: any = await this.dao.executeQuery(
                `SELECT balance, total_credited, total_debited FROM wallets WHERE user_id = ?`, [payload.user_id]);
            const t: any = await this.dao.executeQuery(
                `SELECT txn_id, direction, amount, balance_after, source, description, created_at
                 FROM wallet_transactions WHERE user_id = ? ORDER BY txn_id DESC LIMIT 50`, [payload.user_id]);
            resModel.status = 1; resModel.info = 'OK';
            resModel.data = { ...(w.rows?.[0] || { balance: 0, total_credited: 0, total_debited: 0 }), transactions: t.rows || [] };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }

    /**
     * Withdrawal request for any wallet holder. Debits the wallet immediately
     * (reserving the funds) and records a PENDING payout for admin processing.
     */
    async withdraw(payload: { user_id: number, amount: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const amount = Number(payload.amount);
            if (!amount || amount <= 0) throw new Error('Enter a valid withdrawal amount.');
            await debitWallet(payload.user_id, amount, 'WITHDRAWAL', 'withdrawal', null, 'Withdrawal request');
            const ins: any = await this.dao.executeQuery(
                `INSERT INTO dealer_payouts (dealer_id, amount, status) VALUES (?,?, 'PENDING')`, [payload.user_id, amount]);
            // Tie the reversal reference to this payout row.
            await this.dao.executeQuery(
                `UPDATE wallet_transactions SET reference_id = ? WHERE user_id = ? AND source = 'WITHDRAWAL' AND reference_id IS NULL ORDER BY txn_id DESC LIMIT 1`,
                [ins.insertId, payload.user_id]);
            resModel.status = 1; resModel.info = 'Withdrawal requested.'; resModel.data = { payout_id: ins.insertId, balance: await getBalance(payload.user_id) };
        } catch (error) { resModel.status = -33; resModel.info = 'catch : ' + error; }
        return resModel;
    }
}

/** Reverses a withdrawal back into the wallet (used when admin rejects a payout). */
export async function reverseWithdrawal(payoutId: number, userId: number, amount: number): Promise<void> {
    const ok = await creditWallet(userId, amount, 'WITHDRAWAL_REVERSAL', 'payout', payoutId, 'Withdrawal rejected — refunded');
    if (ok) await pushNotification({ user_id: userId, type: 'wallet', title: 'Withdrawal refunded', message: `₹${amount} was returned to your wallet.` });
}
