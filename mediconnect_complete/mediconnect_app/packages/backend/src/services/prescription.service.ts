import { db } from '../config/database';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { PDFService } from './pdf.service';
import { S3Service } from './s3.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class PrescriptionService {
    private pdfService: PDFService;
    private s3Service: S3Service;

    constructor() {
        this.pdfService = new PDFService();
        this.s3Service = new S3Service();
    }

    async createPrescription(
        consultationId: string,
        providerId: string,
        prescriptionData: any
    ): Promise<any> {
        return await db.transaction(async (client) => {
            try {
                // Get consultation details
                const consultation = await client.query(
                    'SELECT patient_id FROM consultations WHERE id = $1',
                    [consultationId]
                );

                if (consultation.rows.length === 0) {
                    throw new AppError('Consultation not found', 404);
                }

                // Generate unique QR code data
                const qrCodeData = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

                // Create prescription record
                const prescription = await client.query(
                    `INSERT INTO prescriptions (
                        consultation_id,
                        prescribing_provider_id,
                        patient_id,
                        prescription_data,
                        qr_code_data,
                        expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *`,
                    [
                        consultationId,
                        providerId,
                        consultation.rows[0].patient_id,
                        prescriptionData,
                        qrCodeData,
                        expiresAt
                    ]
                );

                // Insert prescription items
                for (const item of prescriptionData.medications) {
                    await client.query(
                        `INSERT INTO prescription_items (
                            prescription_id,
                            drug_name,
                            strength,
                            form,
                            quantity,
                            instructions,
                            substitution_allowed
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            prescription.rows[0].id,
                            item.name,
                            item.strength,
                            item.form,
                            item.quantity,
                            item.instructions,
                            item.substitution_allowed ?? true
                        ]
                    );
                }

                // Generate QR code image
                const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
                    errorCorrectionLevel: 'H',
                    type: 'image/png',
                    width: 300,
                    margin: 1,
                });

                // Log prescription creation
                await client.query(
                    `INSERT INTO audit_events (
                        user_id,
                        event_type,
                        resource_type,
                        resource_id,
                        event_data
                    ) VALUES ($1, 'prescription.created', 'prescription', $2, $3)`,
                    [
                        consultation.rows[0].patient_id,
                        prescription.rows[0].id,
                        { provider_id: providerId }
                    ]
                );

                return {
                    ...prescription.rows[0],
                    qr_code_image: qrCodeImage
                };
            } catch (error) {
                logger.error('Failed to create prescription:', error);
                throw error;
            }
        });
    }

    async verifyPrescriptionQR(qrCodeData: string, pharmacyId: string): Promise<any> {
        try {
            // Check if QR code exists and is valid
            const prescription = await db.query(
                `SELECT p.*, u.full_name as patient_name
                FROM prescriptions p
                JOIN users u ON p.patient_id = u.id
                WHERE p.qr_code_data = $1`,
                [qrCodeData]
            );

            if (prescription.rows.length === 0) {
                return { valid: false, reason: 'invalid_code' };
            }

            const prescriptionData = prescription.rows[0];

            // Check if QR is enabled
            if (!prescriptionData.qr_enabled) {
                return { valid: false, reason: 'pdf_downloaded' };
            }

            // Check if expired
            if (new Date() > new Date(prescriptionData.expires_at)) {
                return { valid: false, reason: 'expired' };
            }

            // Check if already fulfilled
            if (prescriptionData.status === 'fulfilled') {
                return { valid: false, reason: 'already_used' };
            }

            // Get prescription items (item-only view for pharmacy)
            const items = await db.query(
                `SELECT drug_name, strength, form, quantity, instructions
                FROM prescription_items
                WHERE prescription_id = $1`,
                [prescriptionData.id]
            );

            // Create pharmacy claim
            await db.query(
                `INSERT INTO pharmacy_claims (
                    prescription_id,
                    pharmacy_id,
                    status
                ) VALUES ($1, $2, 'ready')`,
                [prescriptionData.id, pharmacyId]
            );

            // Return masked data for pharmacy
            return {
                valid: true,
                prescription: {
                    id: prescriptionData.id,
                    medications: items.rows,
                    prescribing_doctor: 'Dr. ' + prescriptionData.prescribing_provider_id.substring(0, 8),
                    issue_date: prescriptionData.created_at
                }
            };
        } catch (error) {
            logger.error('Failed to verify prescription QR:', error);
            throw error;
        }
    }

    async downloadPrescriptionPDF(prescriptionId: string, userId: string): Promise<any> {
        return await db.transaction(async (client) => {
            try {
                // Get prescription details
                const prescription = await client.query(
                    `SELECT p.*, u.full_name, pr.user_id as provider_user_id
                    FROM prescriptions p
                    JOIN users u ON p.patient_id = u.id
                    JOIN providers pr ON p.prescribing_provider_id = pr.id
                    WHERE p.id = $1 AND p.patient_id = $2`,
                    [prescriptionId, userId]
                );

                if (prescription.rows.length === 0) {
                    throw new AppError('Prescription not found', 404);
                }

                // Get provider details
                const provider = await client.query(
                    `SELECT u.full_name as doctor_name, p.license_number
                    FROM providers p
                    JOIN users u ON p.user_id = u.id
                    WHERE p.id = $1`,
                    [prescription.rows[0].prescribing_provider_id]
                );

                // Get prescription items
                const items = await client.query(
                    'SELECT * FROM prescription_items WHERE prescription_id = $1',
                    [prescriptionId]
                );

                // Generate PDF
                const pdfBuffer = await this.pdfService.generatePrescriptionPDF({
                    prescription: prescription.rows[0],
                    doctor: provider.rows[0],
                    medications: items.rows
                });

                // Upload to S3
                const pdfKey = `prescriptions/${prescriptionId}.pdf`;
                const pdfUrl = await this.s3Service.upload(pdfBuffer, pdfKey, 'application/pdf');

                // Disable QR code permanently
                await client.query(
                    `UPDATE prescriptions 
                    SET qr_enabled = false, 
                        pdf_url = $1,
                        pdf_downloaded_at = NOW()
                    WHERE id = $2`,
                    [pdfUrl, prescriptionId]
                );

                // Log PDF download
                await client.query(
                    `INSERT INTO audit_events (
                        user_id,
                        event_type,
                        resource_type,
                        resource_id,
                        event_data
                    ) VALUES ($1, 'prescription.pdf_downloaded', 'prescription', $2, $3)`,
                    [userId, prescriptionId, { qr_disabled: true }]
                );

                return { url: pdfUrl, buffer: pdfBuffer };
            } catch (error) {
                logger.error('Failed to download prescription PDF:', error);
                throw error;
            }
        });
    }

    async fulfillPrescription(
        prescriptionId: string,
        pharmacyId: string,
        dispensedItems: any[]
    ): Promise<void> {
        try {
            await db.transaction(async (client) => {
                // Update pharmacy claim
                await client.query(
                    `UPDATE pharmacy_claims 
                    SET status = 'dispensed',
                        dispensed_items = $1,
                        created_at = NOW()
                    WHERE prescription_id = $2 AND pharmacy_id = $3`,
                    [JSON.stringify(dispensedItems), prescriptionId, pharmacyId]
                );

                // Update prescription status
                await client.query(
                    `UPDATE prescriptions 
                    SET status = 'fulfilled',
                        fulfilled_at = NOW(),
                        fulfilling_pharmacy_id = $1
                    WHERE id = $2`,
                    [pharmacyId, prescriptionId]
                );

                // Log fulfillment
                await client.query(
                    `INSERT INTO audit_events (
                        user_id,
                        event_type,
                        resource_type,
                        resource_id,
                        event_data
                    ) VALUES (null, 'prescription.fulfilled', 'prescription', $1, $2)`,
                    [prescriptionId, { pharmacy_id: pharmacyId }]
                );
            });

            logger.info('Prescription fulfilled', { prescriptionId, pharmacyId });
        } catch (error) {
            logger.error('Failed to fulfill prescription:', error);
            throw error;
        }
    }
}

export default new PrescriptionService();
