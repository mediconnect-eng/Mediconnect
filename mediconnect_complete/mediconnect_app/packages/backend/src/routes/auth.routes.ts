import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import authService from '../services/auth.service';
import { AppError } from '../utils/errors';
import { rateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Request OTP
router.post(
    '/request-otp',
    rateLimiter,
    [
        body('phone_number')
            .matches(/^\+254[0-9]{9}$/)
            .withMessage('Invalid Kenyan phone number format'),
        body('language')
            .optional()
            .isIn(['en', 'sw'])
            .withMessage('Language must be en or sw')
    ],
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { phone_number } = req.body;
            await authService.requestOTP(phone_number);

            res.status(200).json({
                success: true,
                message: 'OTP sent via WhatsApp',
                expires_in: 300 // 5 minutes
            });
        } catch (error) {
            next(error);
        }
    }
);

// Verify OTP
router.post(
    '/verify-otp',
    [
        body('phone_number')
            .matches(/^\+254[0-9]{9}$/)
            .withMessage('Invalid phone number format'),
        body('otp_code')
            .matches(/^[0-9]{6}$/)
            .withMessage('OTP must be 6 digits')
    ],
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { phone_number, otp_code } = req.body;
            const result = await authService.verifyOTP(phone_number, otp_code);

            res.status(200).json({
                success: true,
                access_token: result.token,
                expires_in: 2592000, // 30 days
                user: {
                    id: result.user.id,
                    phone_number: result.user.phone_number,
                    full_name: result.user.full_name,
                    role: result.user.role,
                    preferred_language: result.user.preferred_language
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

// Refresh Token
router.post(
    '/refresh',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                throw new AppError('No token provided', 401);
            }

            const token = authHeader.split(' ')[1];
            const payload = await authService.verifyToken(token);

            // Generate new token
            const newToken = await authService.refreshToken(payload.userId);

            res.status(200).json({
                success: true,
                access_token: newToken,
                expires_in: 2592000
            });
        } catch (error) {
            next(error);
        }
    }
);

// Logout
router.post(
    '/logout',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.id;
            if (userId) {
                await authService.logout(userId);
            }

            res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
