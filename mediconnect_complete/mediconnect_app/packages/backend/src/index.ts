import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { errorMiddleware } from './middleware/error.middleware';
import { auditMiddleware } from './middleware/audit.middleware';
import { rateLimiter } from './middleware/rate-limit.middleware';
import { logger } from './utils/logger';

// Routes
import authRoutes from './routes/auth.routes';
import consultationRoutes from './routes/consultation.routes';
import prescriptionRoutes from './routes/prescription.routes';
import referralRoutes from './routes/referral.routes';
import partnerRoutes from './routes/partner.routes';

// Initialize environment
dotenv.config();

// Initialize Express app
const app: Application = express();
const server = createServer(app);

// WebSocket server for real-time messaging
const wss = new WebSocketServer({ server });

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3001'],
    credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit logging middleware
app.use(auditMiddleware);

// Rate limiting
app.use('/api/', rateLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/partners', partnerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use(errorMiddleware);

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    logger.info('New WebSocket connection established');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleWebSocketMessage(ws, message);
        } catch (error) {
            logger.error('WebSocket message error:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        logger.info('WebSocket connection closed');
    });

    ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
    });
});

function handleWebSocketMessage(ws: any, message: any) {
    // Handle different message types
    switch (message.type) {
        case 'auth':
            // Authenticate WebSocket connection
            break;
        case 'message':
            // Handle chat message
            break;
        case 'typing':
            // Handle typing indicator
            break;
        case 'presence':
            // Handle presence updates
            break;
        default:
            ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`MediConnect Backend running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
    });
});

export default app;
