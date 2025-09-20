import axios from 'axios';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class WhatsAppService {
    private apiUrl: string;
    private phoneId: string;
    private apiKey: string;
    private businessId: string;

    constructor() {
        this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
        this.phoneId = process.env.WHATSAPP_PHONE_ID!;
        this.apiKey = process.env.WHATSAPP_API_KEY!;
        this.businessId = process.env.WHATSAPP_BUSINESS_ID!;
    }

    async sendOTP(phoneNumber: string, otp: string): Promise<string> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/${this.phoneId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: phoneNumber.replace('+', ''),
                    type: 'template',
                    template: {
                        name: 'mediconnect_otp',
                        language: { code: 'en' },
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    {
                                        type: 'text',
                                        text: otp
                                    }
                                ]
                            }
                        ]
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.messages?.[0]?.id) {
                return response.data.messages[0].id;
            }

            throw new Error('Failed to send WhatsApp message');
        } catch (error: any) {
            logger.error('WhatsApp API error:', error);
            throw new AppError('Failed to send OTP via WhatsApp', 503);
        }
    }

    async sendNotification(phoneNumber: string, message: string): Promise<void> {
        try {
            await axios.post(
                `${this.apiUrl}/${this.phoneId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: phoneNumber.replace('+', ''),
                    type: 'text',
                    text: { body: message }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            logger.error('WhatsApp notification error:', error);
            // Don't throw - notifications are non-critical
        }
    }

    async generateVideoCallLink(consultationId: string): Promise<string> {
        // Generate WhatsApp video call link
        // In production, this would integrate with WhatsApp Business API
        const baseUrl = 'https://wa.me';
        const gpWhatsappNumber = process.env.GP_WHATSAPP_NUMBER;
        const message = `Starting consultation ${consultationId}`;

        return `${baseUrl}/${gpWhatsappNumber}?text=${encodeURIComponent(message)}`;
    }

    async sendConsultationReminder(phoneNumber: string, appointmentTime: string, providerName: string): Promise<void> {
        try {
            await axios.post(
                `${this.apiUrl}/${this.phoneId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: phoneNumber.replace('+', ''),
                    type: 'template',
                    template: {
                        name: 'appointment_reminder',
                        language: { code: 'en' },
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: providerName },
                                    { type: 'text', text: appointmentTime }
                                ]
                            }
                        ]
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            logger.error('Failed to send appointment reminder:', error);
        }
    }
}

export default WhatsAppService;
