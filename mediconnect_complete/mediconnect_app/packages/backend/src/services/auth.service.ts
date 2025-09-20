import { db } from '../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { WhatsAppService } from './whatsapp.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface AuthPayload {
    userId: string;
    role: string;
    sessionId: string;
}

export class AuthService {
    private whatsappService: WhatsAppService;

    constructor() {
        this.whatsappService = new WhatsAppService();
    }

    async requestOTP(phoneNumber: string): Promise<void> {
        try {
            // Check if phone number exists
            const userQuery = await db.query(
                'SELECT id, role FROM users WHERE phone_number = $1',
                [phoneNumber]
            );

            // Generate 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = await bcrypt.hash(otp, 10);
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Check for existing pending OTP
            const existingOTP = await db.query(
                `SELECT id, attempts FROM wa_auth_codes 
                 WHERE phone_number = $1 AND status = 'pending' AND ttl_expires_at > NOW()`,
                [phoneNumber]
            );

            if (existingOTP.rows.length > 0 && existingOTP.rows[0].attempts >= 5) {
                throw new AppError('Too many OTP attempts. Please try again later.', 429);
            }

            // Store OTP in database
            await db.query(
                `INSERT INTO wa_auth_codes (phone_number, code_hash, ttl_expires_at, status)
                 VALUES ($1, $2, $3, 'pending')
                 ON CONFLICT (phone_number) WHERE status = 'pending'
                 DO UPDATE SET code_hash = $2, ttl_expires_at = $3, attempts = 0`,
                [phoneNumber, otpHash, expiresAt]
            );

            // Send OTP via WhatsApp
            const messageId = await this.whatsappService.sendOTP(phoneNumber, otp);

            // Update with WhatsApp message ID
            await db.query(
                `UPDATE wa_auth_codes SET wa_message_id = $1 
                 WHERE phone_number = $2 AND status = 'pending'`,
                [messageId, phoneNumber]
            );

            logger.info('OTP sent successfully', { phoneNumber, messageId });
        } catch (error) {
            logger.error('Failed to send OTP', { phoneNumber, error });
            throw error;
        }
    }

    async verifyOTP(phoneNumber: string, code: string): Promise<{ token: string; user: any }> {
        try {
            // Get OTP record
            const otpQuery = await db.query(
                `SELECT id, code_hash, attempts, ttl_expires_at 
                 FROM wa_auth_codes 
                 WHERE phone_number = $1 AND status = 'pending'`,
                [phoneNumber]
            );

            if (otpQuery.rows.length === 0) {
                throw new AppError('No pending OTP found', 404);
            }

            const otpRecord = otpQuery.rows[0];

            // Check expiry
            if (new Date() > otpRecord.ttl_expires_at) {
                await db.query(
                    `UPDATE wa_auth_codes SET status = 'expired' WHERE id = $1`,
                    [otpRecord.id]
                );
                throw new AppError('OTP has expired', 401);
            }

            // Verify OTP
            const isValid = await bcrypt.compare(code, otpRecord.code_hash);

            if (!isValid) {
                // Increment attempts
                await db.query(
                    `UPDATE wa_auth_codes SET attempts = attempts + 1 WHERE id = $1`,
                    [otpRecord.id]
                );
                throw new AppError('Invalid OTP', 401);
            }

            // Mark as verified
            await db.query(
                `UPDATE wa_auth_codes SET status = 'verified', verified_at = NOW() WHERE id = $1`,
                [otpRecord.id]
            );

            // Get or create user
            let userQuery = await db.query(
                'SELECT * FROM users WHERE phone_number = $1',
                [phoneNumber]
            );

            let user;
            if (userQuery.rows.length === 0) {
                // Create new user
                const newUser = await db.query(
                    `INSERT INTO users (phone_number, phone_verified_at, role)
                     VALUES ($1, NOW(), 'patient')
                     RETURNING *`,
                    [phoneNumber]
                );
                user = newUser.rows[0];
            } else {
                user = userQuery.rows[0];
                // Update verification timestamp
                await db.query(
                    'UPDATE users SET phone_verified_at = NOW() WHERE id = $1',
                    [user.id]
                );
            }

            // Generate JWT
            const payload: AuthPayload = {
                userId: user.id,
                role: user.role,
                sessionId: crypto.randomUUID()
            };

            const token = jwt.sign(
                payload,
                process.env.JWT_SECRET!,
                { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
            );

            // Log authentication event
            await db.query(
                `INSERT INTO audit_events (user_id, event_type, resource_type, resource_id, event_data)
                 VALUES ($1, 'auth.login', 'user', $1, $2)`,
                [user.id, { method: 'whatsapp_otp' }]
            );

            return { token, user };
        } catch (error) {
            logger.error('OTP verification failed', { phoneNumber, error });
            throw error;
        }
    }

    async verifyToken(token: string): Promise<AuthPayload> {
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
            return payload;
        } catch (error) {
            throw new AppError('Invalid or expired token', 401);
        }
    }

    async logout(userId: string): Promise<void> {
        // Log logout event
        await db.query(
            `INSERT INTO audit_events (user_id, event_type, resource_type, resource_id, event_data)
             VALUES ($1, 'auth.logout', 'user', $1, $2)`,
            [userId, { timestamp: new Date() }]
        );
    }
}

export default new AuthService();
