-- MediConnect Initial Database Schema
-- Version: 1.0.0
-- Date: 2025

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- User Roles Enum
CREATE TYPE user_role AS ENUM (
    'patient',
    'gp',
    'specialist',
    'pharmacy_admin',
    'diagnostics_admin',
    'ops_admin',
    'support',
    'super_admin'
);

-- Consultation Status Enum
CREATE TYPE consultation_status AS ENUM (
    'requested',
    'matched',
    'active',
    'extended',
    'completed',
    'cancelled'
);

-- Message Type Enum
CREATE TYPE message_type AS ENUM (
    'text',
    'image',
    'audio',
    'system',
    'ai_summary'
);

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    phone_verified_at TIMESTAMP,
    full_name VARCHAR(255),
    date_of_birth DATE,
    gender VARCHAR(20),
    emergency_contact VARCHAR(15),
    preferred_language VARCHAR(5) DEFAULT 'en',
    role user_role NOT NULL DEFAULT 'patient',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Providers Table (GPs and Specialists)
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('gp', 'specialist')),
    specialty VARCHAR(100),
    license_number VARCHAR(50) UNIQUE NOT NULL,
    whatsapp_number VARCHAR(15),
    max_concurrent_sessions INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Consultations Table
CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES users(id) NOT NULL,
    provider_id UUID REFERENCES providers(id),
    consultation_type VARCHAR(20) DEFAULT 'gp_primary',
    status consultation_status DEFAULT 'requested',
    mode VARCHAR(20) DEFAULT 'online' CHECK (mode IN ('online', 'offline')),
    ai_intake_summary JSONB,
    consultation_notes TEXT,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_minutes INTEGER,
    capacity_cap_minutes INTEGER DEFAULT 15,
    referral_extension_applied BOOLEAN DEFAULT false,
    whatsapp_call_initiated BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages Table (Chat Thread)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    sender_id UUID REFERENCES users(id),
    sender_role user_role NOT NULL,
    message_type message_type DEFAULT 'text',
    content TEXT,
    attachment_url TEXT,
    metadata JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI Intake Table
CREATE TABLE ai_intake (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    summary_json JSONB NOT NULL,
    red_flags JSONB,
    symptoms JSONB,
    duration VARCHAR(100),
    severity INTEGER CHECK (severity >= 1 AND severity <= 10),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Prescriptions Table
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    prescribing_provider_id UUID REFERENCES providers(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    prescription_data JSONB NOT NULL,
    qr_code_data VARCHAR(255) UNIQUE NOT NULL,
    qr_enabled BOOLEAN DEFAULT true,
    pdf_url TEXT,
    pdf_downloaded_at TIMESTAMP,
    non_verified_disclaimer_accepted_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'fulfilled', 'expired')),
    fulfilled_at TIMESTAMP,
    fulfilling_pharmacy_id UUID,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Prescription Items Table
CREATE TABLE prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID REFERENCES prescriptions(id) NOT NULL,
    drug_name VARCHAR(255) NOT NULL,
    strength VARCHAR(100),
    form VARCHAR(100),
    quantity VARCHAR(100),
    instructions TEXT,
    substitution_allowed BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Partners Table (Pharmacies and Labs)
CREATE TABLE partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('pharmacy', 'diagnostics')),
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    contact_phone VARCHAR(15),
    address TEXT,
    location GEOGRAPHY(POINT),
    operating_hours JSONB,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    onboarded_by UUID REFERENCES users(id),
    onboarded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Pharmacy Claims Table
CREATE TABLE pharmacy_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID REFERENCES prescriptions(id) NOT NULL,
    pharmacy_id UUID REFERENCES partners(id) NOT NULL,
    claimed_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('ready', 'dispensed', 'disputed')),
    external_ref_token VARCHAR(255),
    dispensed_items JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Referrals Table
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    referring_provider_id UUID REFERENCES providers(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    specialist_id UUID REFERENCES providers(id),
    referral_reason TEXT NOT NULL,
    clinical_question TEXT,
    priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('urgent', 'routine')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
    options_presented JSONB,
    selected_option_id VARCHAR(100),
    specialist_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Appointments Table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referral_id UUID REFERENCES referrals(id),
    patient_id UUID REFERENCES users(id) NOT NULL,
    provider_id UUID REFERENCES providers(id) NOT NULL,
    appointment_type VARCHAR(20) DEFAULT 'specialist_consult',
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    channel VARCHAR(20) DEFAULT 'online_wa' CHECK (channel IN ('in_person', 'online_wa', 'online_other')),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
    consultation_notes TEXT,
    reminder_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Lab Orders Table
CREATE TABLE lab_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordering_provider_id UUID REFERENCES providers(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    lab_partner_id UUID REFERENCES partners(id) NOT NULL,
    referral_id UUID REFERENCES referrals(id),
    tests_ordered JSONB NOT NULL,
    clinical_notes TEXT,
    priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('stat', 'urgent', 'routine')),
    status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'scheduled', 'collected', 'processing', 'completed')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Lab Results Table
CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_order_id UUID REFERENCES lab_orders(id) NOT NULL,
    file_url TEXT NOT NULL,
    results_json JSONB,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    viewed_by_patient_at TIMESTAMP,
    viewed_by_specialist_at TIMESTAMP,
    critical_values JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(20) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'both')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    metadata JSONB,
    scheduled_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Events Table
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    event_data JSONB,
    ip_address INET,
    user_agent TEXT,
    purpose TEXT,
    masked_view BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp Auth Codes Table
CREATE TABLE wa_auth_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(15) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    attempts INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'locked')),
    wa_message_id VARCHAR(255),
    ttl_expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP
);

-- Video Call Events Table
CREATE TABLE video_call_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    channel VARCHAR(20) DEFAULT 'whatsapp',
    provider_name VARCHAR(100),
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    metadata_json JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create Indexes
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_provider ON consultations(provider_id);
CREATE INDEX idx_consultations_status ON consultations(status);
CREATE INDEX idx_messages_consultation ON messages(consultation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_qr ON prescriptions(qr_code_data) WHERE qr_enabled = true;
CREATE INDEX idx_partners_location ON partners USING GIST(location);
CREATE INDEX idx_partners_type ON partners(partner_type);
CREATE INDEX idx_referrals_patient ON referrals(patient_id);
CREATE INDEX idx_referrals_specialist ON referrals(specialist_id);
CREATE INDEX idx_appointments_provider ON appointments(provider_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_audit_events_user ON audit_events(user_id);
CREATE INDEX idx_audit_events_created ON audit_events(created_at DESC);
