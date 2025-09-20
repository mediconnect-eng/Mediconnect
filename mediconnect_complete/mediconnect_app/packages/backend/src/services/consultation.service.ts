import { db } from '../config/database';
import { AIIntakeService } from './ai-intake.service';
import { NotificationService } from './notification.service';
import { WhatsAppService } from './whatsapp.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class ConsultationService {
    private aiIntakeService: AIIntakeService;
    private notificationService: NotificationService;
    private whatsappService: WhatsAppService;

    constructor() {
        this.aiIntakeService = new AIIntakeService();
        this.notificationService = new NotificationService();
        this.whatsappService = new WhatsAppService();
    }

    async createConsultation(patientId: string, intakeData: any): Promise<any> {
        try {
            // Process AI intake
            const aiSummary = await this.aiIntakeService.processIntake(intakeData);

            // Create consultation record
            const consultation = await db.query(
                `INSERT INTO consultations (
                    patient_id, 
                    consultation_type, 
                    status, 
                    ai_intake_summary
                ) VALUES ($1, 'gp_primary', 'requested', $2)
                RETURNING *`,
                [patientId, aiSummary]
            );

            // Store detailed intake
            await db.query(
                `INSERT INTO ai_intake (
                    consultation_id,
                    summary_json,
                    symptoms,
                    duration,
                    severity,
                    red_flags
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    consultation.rows[0].id,
                    aiSummary,
                    intakeData.symptoms,
                    intakeData.duration,
                    intakeData.severity,
                    aiSummary.redFlags || []
                ]
            );

            // Assign GP
            await this.assignGP(consultation.rows[0].id);

            // Send notification
            await this.notificationService.notifyUser(
                patientId,
                'Consultation Request Received',
                'We are finding a doctor for you. Estimated wait time: 5-15 minutes',
                'both'
            );

            return consultation.rows[0];
        } catch (error) {
            logger.error('Failed to create consultation:', error);
            throw error;
        }
    }

    async assignGP(consultationId: string): Promise<void> {
        try {
            // Find available GP using round-robin with capacity check
            const availableGP = await db.query(
                `SELECT p.* FROM providers p
                LEFT JOIN (
                    SELECT provider_id, COUNT(*) as active_count
                    FROM consultations
                    WHERE status IN ('matched', 'active', 'extended')
                    GROUP BY provider_id
                ) c ON p.id = c.provider_id
                WHERE p.provider_type = 'gp'
                AND p.is_active = true
                AND (c.active_count IS NULL OR c.active_count < p.max_concurrent_sessions)
                ORDER BY c.active_count ASC NULLS FIRST
                LIMIT 1`
            );

            if (availableGP.rows.length === 0) {
                throw new AppError('No GP available at the moment', 503);
            }

            // Assign GP to consultation
            await db.query(
                `UPDATE consultations 
                SET provider_id = $1, status = 'matched', updated_at = NOW()
                WHERE id = $2`,
                [availableGP.rows[0].id, consultationId]
            );

            // Notify GP
            const gpUser = await db.query(
                'SELECT user_id FROM providers WHERE id = $1',
                [availableGP.rows[0].id]
            );

            await this.notificationService.notifyUser(
                gpUser.rows[0].user_id,
                'New Patient Assigned',
                'You have a new patient waiting for consultation',
                'in_app'
            );

            logger.info('GP assigned to consultation', { 
                consultationId, 
                providerId: availableGP.rows[0].id 
            });
        } catch (error) {
            logger.error('Failed to assign GP:', error);
            throw error;
        }
    }

    async startConsultation(consultationId: string, providerId: string): Promise<any> {
        try {
            // Update consultation status
            await db.query(
                `UPDATE consultations 
                SET status = 'active', started_at = NOW()
                WHERE id = $1 AND provider_id = $2`,
                [consultationId, providerId]
            );

            // Get consultation details
            const consultation = await db.query(
                `SELECT c.*, u.phone_number, u.full_name
                FROM consultations c
                JOIN users u ON c.patient_id = u.id
                WHERE c.id = $1`,
                [consultationId]
            );

            // Generate WhatsApp video call link
            const videoCallLink = await this.whatsappService.generateVideoCallLink(consultationId);

            // Send video call link to patient
            await this.whatsappService.sendNotification(
                consultation.rows[0].phone_number,
                `Your doctor is ready. Please join the video call: ${videoCallLink}`
            );

            // Log video call event
            await db.query(
                `INSERT INTO video_call_events (consultation_id, channel, started_at)
                VALUES ($1, 'whatsapp', NOW())`,
                [consultationId]
            );

            return {
                consultation: consultation.rows[0],
                videoCallLink
            };
        } catch (error) {
            logger.error('Failed to start consultation:', error);
            throw error;
        }
    }

    async endConsultation(consultationId: string, notes: string): Promise<void> {
        try {
            const result = await db.query(
                `UPDATE consultations 
                SET status = 'completed', 
                    ended_at = NOW(), 
                    consultation_notes = $2,
                    duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
                WHERE id = $1
                RETURNING duration_minutes`,
                [consultationId, notes]
            );

            // Update video call event
            await db.query(
                `UPDATE video_call_events 
                SET ended_at = NOW()
                WHERE consultation_id = $1 AND ended_at IS NULL`,
                [consultationId]
            );

            logger.info('Consultation ended', { 
                consultationId, 
                duration: result.rows[0].duration_minutes 
            });
        } catch (error) {
            logger.error('Failed to end consultation:', error);
            throw error;
        }
    }

    async extendConsultation(consultationId: string, reason: string = 'referral'): Promise<void> {
        try {
            await db.query(
                `UPDATE consultations 
                SET capacity_cap_minutes = capacity_cap_minutes + 10,
                    referral_extension_applied = true,
                    status = 'extended'
                WHERE id = $1`,
                [consultationId]
            );

            logger.info('Consultation extended', { consultationId, reason });
        } catch (error) {
            logger.error('Failed to extend consultation:', error);
            throw error;
        }
    }

    async sendMessage(consultationId: string, senderId: string, content: string, senderRole: string): Promise<any> {
        try {
            const message = await db.query(
                `INSERT INTO messages (
                    consultation_id,
                    sender_id,
                    sender_role,
                    content,
                    message_type
                ) VALUES ($1, $2, $3, $4, 'text')
                RETURNING *`,
                [consultationId, senderId, senderRole, content]
            );

            // Emit WebSocket event for real-time delivery
            // This would be implemented in the WebSocket handler

            return message.rows[0];
        } catch (error) {
            logger.error('Failed to send message:', error);
            throw error;
        }
    }

    async getMessages(consultationId: string, limit: number = 50): Promise<any[]> {
        try {
            const messages = await db.query(
                `SELECT m.*, u.full_name as sender_name
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.consultation_id = $1
                ORDER BY m.created_at DESC
                LIMIT $2`,
                [consultationId, limit]
            );

            return messages.rows;
        } catch (error) {
            logger.error('Failed to get messages:', error);
            throw error;
        }
    }
}

export default new ConsultationService();
