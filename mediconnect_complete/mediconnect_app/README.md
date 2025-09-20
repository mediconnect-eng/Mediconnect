# MediConnect Healthcare Platform

## 🏥 Overview
MediConnect is a Healthcare-as-a-Service (HaaS) platform designed to provide GP-orchestrated patient care in Kenya. The platform features WhatsApp-based authentication, AI-powered intake, video consultations, digital prescriptions, and specialist referrals.

## 🚀 Features
- **WhatsApp Authentication**: OTP-based authentication via WhatsApp
- **AI Intake**: Intelligent symptom assessment before consultations
- **GP Consultations**: 15-minute video consultations via WhatsApp
- **Digital Prescriptions**: QR code-based prescription system with PDF backup
- **Specialist Referrals**: GP-curated specialist network
- **Pharmacy Network**: Verified pharmacy partners with item-only prescription views
- **Diagnostics Integration**: Lab order management with minimal PII exposure
- **Multi-language Support**: English and Swahili localization

## 📋 Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- WhatsApp Business API Access
- Android Studio (for mobile app development)

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/mediconnect/mediconnect-app.git
cd mediconnect-app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Set up the database
```bash
docker-compose up -d postgres redis
npm run db:migrate
npm run db:seed
```

### 5. Start development servers
```bash
# Start all services
npm run dev

# Or start individually
npm run dev:backend    # Backend API on :3000
npm run dev:patient    # Patient mobile app
npm run dev:portals    # Web portals on :3001
```

## 🏗️ Architecture

### Backend Stack
- **Framework**: Node.js with Express and TypeScript
- **Database**: PostgreSQL with Row-Level Security
- **Cache**: Redis for session management
- **Authentication**: JWT with WhatsApp OTP
- **Real-time**: WebSocket for messaging
- **Storage**: S3-compatible (Cloudflare R2)

### Frontend Stack
- **Patient App**: React Native (Android)
- **Web Portals**: Next.js with TypeScript
- **State Management**: Redux Toolkit
- **Localization**: i18next
- **UI Components**: React Native Elements

## 📱 Mobile App Development

### Android Setup
```bash
cd packages/patient-app
npm run android
```

### Build APK
```bash
cd android
./gradlew assembleRelease
```

## 🌐 API Documentation
API documentation is available at `http://localhost:3000/api-docs` when running in development mode.

## 🔒 Security Features
- Row-Level Security (RLS) at database level
- PII minimization for partner portals
- Encrypted data at rest and in transit
- Comprehensive audit logging
- Time-boxed support access
- QR code single-use enforcement

## 📊 Database Schema
The database uses PostgreSQL with the following key tables:
- `users`: User accounts and profiles
- `providers`: GP and specialist details
- `consultations`: Consultation records
- `messages`: Chat messages
- `prescriptions`: Digital prescriptions
- `referrals`: Specialist referrals
- `partners`: Pharmacies and labs
- `audit_events`: Comprehensive audit trail

## 🚀 Deployment

### Using Docker
```bash
docker-compose up -d
```

### Production Deployment
1. Build the applications:
```bash
npm run build
```

2. Set production environment variables
3. Deploy using your preferred platform (AWS, GCP, Azure)

## 📝 License
Proprietary - MediConnect Healthcare Ltd.

## 🤝 Contributing
Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## 📞 Support
For support, email support@mediconnect.health or join our Slack channel.

## 🔄 Development Workflow
1. Create feature branch from `develop`
2. Make changes and test locally
3. Submit pull request with tests
4. Code review and CI/CD pipeline
5. Merge to develop for staging
6. Release to main for production

## 📈 Monitoring
- Application metrics: DataDog
- Error tracking: Sentry
- Logs: CloudWatch/ELK Stack
- Uptime: StatusPage

---
Built with ❤️ for accessible healthcare in Kenya
