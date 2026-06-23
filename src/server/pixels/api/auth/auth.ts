import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { CryptoJS } from '../../../pixels-utility/cryptoJS';
import { MasterModel } from '../../../models/MasterModel';
import { pushNotification } from '../notifications/notifications';
import { hashPassword, verifyPassword, isLegacyPassword } from '../../../pixels-utility/password';
import { randomBytes } from "crypto";
import * as path from 'path';
import * as fs from 'fs';

export class PixelsAuth {
    private mysqlDAO: MySqlClient;
    private logger: Logger;
    private cryptoJS: CryptoJS;
    private masterModel: MasterModel;
    constructor() {
        this.mysqlDAO = new MySqlClient('pixels');
        this.logger = new Logger();
        this.cryptoJS = new CryptoJS();
        this.masterModel = new MasterModel();
    }

    createSecretKey(length: number = 32): string {
        return randomBytes(length).toString("hex");
    }

    async userLogin(payload: { email: string, password: string }) {
        //generating query
        let startMS = new Date().getTime();
        let query = '';
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        try {
            const tableName = 'auth_user'

            if (!payload.email || payload.email === '') {
                throw new Error('Invalid Email ID.')
            }

            if (!payload.password || payload.password === '') {
                throw new Error('Invalid Password.')
            }

            // A02/A03: look up by email only (parameterized), then verify the
            // password hash in code. Never match the password inside SQL.
            query = `SELECT * FROM ${tableName} WHERE email = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [payload.email.trim()]);

            if (queryModel.status !== 1) {
                throw new Error('Unable to verify credentials, please try again.')
            }

            // Uniform error for unknown email vs wrong password (no user enumeration).
            if (queryModel.fetchedRows === 0 || !verifyPassword(payload.password, queryModel.rows[0].password)) {
                throw new Error('Invalid login credentials, please try again.')
            }

            const userRow = queryModel.rows[0];

            // Transparently upgrade legacy plaintext passwords to scrypt on login.
            if (isLegacyPassword(userRow.password)) {
                try {
                    await this.mysqlDAO.executeQuery(
                        `UPDATE ${tableName} SET password = ? WHERE user_id = ?`,
                        [hashPassword(payload.password), userRow.user_id]
                    );
                } catch (e) { this.logger.error('password upgrade failed: ' + e); }
            }

            delete userRow.password; // A02: never return the password hash
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = userRow;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + resModel.info + ' : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        //returning the model
        return resModel;
    }

    async userRegister(payload: {
        "full_name": string,
        "phone": string,
        "email": string,
        "password": string,
        "confirm_password": string,
        "ref_code"?: string
    }) {
        //generating query
        let startMS = new Date().getTime();
        let query = '';
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        const tableName = 'auth_user';
        try {

            const { email, password, confirm_password, full_name, phone, ref_code } = payload;
            if (!email || !password || !confirm_password || !full_name || !phone) {
                throw new Error('All fields are required, please provide valid details.')
            }
            if (password !== confirm_password) {
                throw new Error('Password and Confirm Password do not match.')
            }

            // Resolve the optional referrer from their referral code.
            let referrerId: number | null = null;
            const cleanRefCode = (ref_code || '').trim();
            if (cleanRefCode) {
                const refLookup: any = await this.mysqlDAO.executeQuery(
                    `SELECT user_id FROM ${tableName} WHERE referral_code = ?`, [cleanRefCode]
                );
                if (refLookup.status === 1 && refLookup.fetchedRows > 0) {
                    referrerId = refLookup.rows[0].user_id;
                }
            }

            // Generate a unique referral code for the new user.
            const newReferralCode = ('VNW' + randomBytes(4).toString('hex')).toUpperCase().slice(0, 12);

            // New buyers register as USER; dealer onboarding is a separate admin-approved flow.
            const requestedRole = (payload as any).role && String((payload as any).role).toUpperCase() === 'DEALER' ? 'DEALER' : 'USER';

            query = `INSERT INTO ${tableName} (email, phone, password, full_name, role, logo, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, '', ?, ?)`;
            queryModel = await this.mysqlDAO.executeQuery(query, [email.trim(), phone.trim(), hashPassword(password), full_name.trim(), requestedRole, newReferralCode, referrerId]);

            if (queryModel.status !== 1 || queryModel.insertId == 0) {
                let message = 'Unable to register user, please try again.'
                if (queryModel.info && queryModel.info.toLowerCase().includes('duplicate')) {
                    if (queryModel.info.toLowerCase().includes('email')) {
                        message = 'Email already exists, please use a different email.'
                    } else if (queryModel.info.toLowerCase().includes('phone')) {
                        message = 'Phone number already exists, please use a different phone number.'
                    }
                }
                throw new Error(message)
            }

            const newUserId = queryModel.insertId;

            // Create the new user's shopping cart up-front.
            await this.mysqlDAO.executeQuery(`INSERT IGNORE INTO carts (user_id) VALUES (?)`, [newUserId]);

            // If the user registered as a dealer, create a pending dealer profile for admin KYC.
            if (requestedRole === 'DEALER') {
                await this.mysqlDAO.executeQuery(
                    `INSERT IGNORE INTO dealer_profiles (dealer_id, business_name, kyc_status) VALUES (?, ?, 'PENDING')`,
                    [newUserId, full_name.trim()]
                );
            }

            // Welcome notification for the new user.
            await pushNotification({
                user_id: newUserId, type: 'welcome',
                title: 'Welcome to VIP Number World! 👑',
                message: 'Your account is ready. Browse premium VIP numbers, build your wishlist, and grab your perfect number. Share your referral link to earn rewards.',
            });

            query = `SELECT * FROM ${tableName} WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [newUserId]);

            if (queryModel.status !== 1) {
                throw new Error('Unable to load registered user details.')
            }

            if (queryModel.fetchedRows === 0) {
                throw new Error('Registered user record not found.')
            }

            const registered = queryModel.rows[0];
            delete registered.password; // A02: never return the password hash
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = registered;
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + resModel.info + ' : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        //returning the model
        return resModel;
    }

    async userChangePassword(payload: {
        "user_id": number,
        "current_password": string,
        "password": string,
        "confirm_password": string
    }) {
        //generating query
        let startMS = new Date().getTime();
        let query = '';
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        const tableName = 'auth_user';
        try {

            const { user_id, current_password, password, confirm_password } = payload;
            if (!user_id || !current_password || !password || !confirm_password) {
                throw new Error('All fields are required, please provide valid details.')
            }
            if (password !== confirm_password) {
                throw new Error('Password and Confirm Password do not match.')
            }
            if (String(password).length < 6) {
                throw new Error('Password must be at least 6 characters.')
            }

            // A01: operate only on the authenticated account (user_id from token).
            query = `SELECT user_id, password FROM ${tableName} WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [user_id]);
            if (queryModel.fetchedRows === 0) {
                throw new Error('Account not found.')
            }

            // A02/A03: verify current password against the stored hash (no SQL match).
            if (!verifyPassword(current_password, queryModel.rows[0].password)) {
                throw new Error('Current password is incorrect.')
            }

            query = `UPDATE ${tableName} SET password = ? WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [hashPassword(password), user_id]);
            if (queryModel.status !== 1) {
                throw new Error(queryModel.info || 'Unable to update password. Please try again.')
            }

            await pushNotification({
                user_id: Number(user_id), type: 'security',
                title: 'Password changed',
                message: 'Your account password was changed successfully. If this wasn\'t you, contact support immediately.',
            });

            resModel.status = 1;
            resModel.info = 'Password updated successfully.';
            resModel.data = { user_id: Number(user_id) };

        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + resModel.info + ' : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        //returning the model
        return resModel;
    }

    private readonly SAFE_USER_COLS = 'user_id, email, phone, role, full_name, address, status, logo, referral_code, referred_by, created_at';

    /** Returns the authenticated user's profile (no password). */
    async getProfile(payload: { user_id: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            if (!payload.user_id) throw new Error('Unauthorized.');
            const q: any = await this.mysqlDAO.executeQuery(
                `SELECT ${this.SAFE_USER_COLS} FROM auth_user WHERE user_id = ?`, [payload.user_id]
            );
            if (q.status !== 1 || q.fetchedRows === 0) throw new Error('Account not found.');
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = q.rows[0];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    async userUpdateProfile(payload: {
        "user_id": number,
        "phone"?: string,
        "name"?: string,
        "address"?: string,
    }) {
        let startMS = new Date().getTime();
        let query = '';
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        const tableName = 'auth_user';
        try {
            const { user_id, phone, name, address } = payload;
            if (!user_id) throw new Error('Unauthorized.');
            if (!name || !String(name).trim()) throw new Error('Name is required.');

            // A01: update only the authenticated account; only known-safe columns.
            const sets: string[] = ['full_name = ?', 'address = ?'];
            const params: any[] = [String(name).trim(), String(address || '').trim()];
            if (phone && String(phone).trim() !== '') { sets.push('phone = ?'); params.push(String(phone).trim()); }
            params.push(user_id);

            query = `UPDATE ${tableName} SET ${sets.join(', ')} WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, params);

            query = `SELECT ${this.SAFE_USER_COLS} FROM ${tableName} WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [user_id]);
            if (queryModel.status !== 1 || queryModel.fetchedRows === 0) {
                throw new Error('Unable to load profile.')
            }

            await pushNotification({
                user_id: Number(user_id), type: 'profile',
                title: 'Profile updated',
                message: 'Your profile information was updated successfully.',
            });

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = queryModel.rows[0];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + resModel.info + ' : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    /**
     * Public: a logged-out user submits a password-reset request (email + reason).
     * The email MUST belong to an existing account — otherwise an explicit
     * "incorrect email" error is returned. All validation is enforced here (API/DB).
     */
    async requestPasswordReset(payload: { email: string, reason: string }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        const tableName = 'auth_user';
        try {
            const email = (payload.email || '').trim();
            const reason = (payload.reason || '').trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please provide a valid email address.');
            if (!reason || reason.length < 5) throw new Error('Please provide a brief reason for the reset.');

            // The email must exist in our records, otherwise reject with a clear error.
            const userQ: any = await this.mysqlDAO.executeQuery(
                `SELECT user_id FROM ${tableName} WHERE email = ?`, [email]
            );
            if (!userQ.rows || userQ.fetchedRows === 0) {
                resModel.status = -1;
                resModel.info = 'No account found with this email address. Please check and try again.';
                resModel.data = {};
                return resModel;
            }
            const userId = userQ.rows[0].user_id;

            // Avoid stacking duplicate pending requests for the same account.
            const dupQ: any = await this.mysqlDAO.executeQuery(
                `SELECT reset_id FROM password_reset_requests WHERE email = ? AND status = 'PENDING'`, [email]
            );
            if (dupQ.rows && dupQ.rows.length > 0) {
                resModel.status = 1;
                resModel.info = 'A reset request for this email is already pending admin review.';
                resModel.data = { already_pending: true };
                return resModel;
            }

            await this.mysqlDAO.executeQuery(
                `INSERT INTO password_reset_requests (user_id, email, reason, status) VALUES (?, ?, ?, 'PENDING')`,
                [userId, email, reason.slice(0, 1000)]
            );

            resModel.status = 1;
            resModel.info = 'Your password reset request has been submitted for admin review.';
            resModel.data = {};
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }

    async userUpdateLogo(payload: {
        "user_id": number,
        "logo": string
    }) {
        let startMS = new Date().getTime();
        let query = '';
        let queryModel: any = this.masterModel.getQueryModel();
        let resModel = this.masterModel.getResponseModel();
        const tableName = 'auth_user';
        try {
            const { user_id, logo } = payload;
            if (!user_id) throw new Error('Unauthorized.');
            if (!logo) throw new Error('No image provided.');
            // Basic validation: must be an image data URL, capped ~8MB (base64 ~ 11MB).
            if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(logo)) {
                throw new Error('Invalid image format.')
            }
            if (logo.length > 11_500_000) {
                throw new Error('Image is too large (max 8 MB).')
            }

            query = `UPDATE ${tableName} SET logo = ? WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [logo, user_id]);
            if (queryModel.affectedRows === 0) throw new Error('Unable to update image.')

            query = `SELECT ${this.SAFE_USER_COLS} FROM ${tableName} WHERE user_id = ?`;
            queryModel = await this.mysqlDAO.executeQuery(query, [user_id]);

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = queryModel.rows[0];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + resModel.info + ' : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
        }
        return resModel;
    }


}
