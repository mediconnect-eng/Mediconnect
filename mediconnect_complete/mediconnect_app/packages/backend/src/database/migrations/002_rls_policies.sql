-- Row Level Security Policies for MediConnect
-- Enable RLS on all tables

-- Users Table RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_read ON users
    FOR SELECT USING (id = current_setting('app.current_user_id')::UUID);

CREATE POLICY users_self_update ON users
    FOR UPDATE USING (id = current_setting('app.current_user_id')::UUID);

-- Consultations RLS
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultations_patient_access ON consultations
    FOR ALL USING (
        patient_id = current_setting('app.current_user_id')::UUID
    );

CREATE POLICY consultations_provider_access ON consultations
    FOR ALL USING (
        provider_id IN (
            SELECT id FROM providers 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Messages RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_consultation_access ON messages
    FOR ALL USING (
        consultation_id IN (
            SELECT id FROM consultations
            WHERE patient_id = current_setting('app.current_user_id')::UUID
            OR provider_id IN (
                SELECT id FROM providers 
                WHERE user_id = current_setting('app.current_user_id')::UUID
            )
        )
    );

-- Prescriptions RLS
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY prescriptions_patient_access ON prescriptions
    FOR SELECT USING (patient_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY prescriptions_provider_access ON prescriptions
    FOR ALL USING (
        prescribing_provider_id IN (
            SELECT id FROM providers 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Pharmacy Claims RLS (Item-only view for pharmacies)
ALTER TABLE pharmacy_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_claims_pharmacy_access ON pharmacy_claims
    FOR SELECT USING (
        pharmacy_id IN (
            SELECT p.id FROM partners p
            JOIN partner_users pu ON p.id = pu.partner_id
            WHERE pu.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Referrals RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrals_patient_access ON referrals
    FOR SELECT USING (patient_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY referrals_provider_access ON referrals
    FOR ALL USING (
        referring_provider_id IN (
            SELECT id FROM providers 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
        OR specialist_id IN (
            SELECT id FROM providers 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Lab Orders RLS (Minimal PII for labs)
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY lab_orders_patient_access ON lab_orders
    FOR SELECT USING (patient_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY lab_orders_provider_access ON lab_orders
    FOR ALL USING (
        ordering_provider_id IN (
            SELECT id FROM providers 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

CREATE POLICY lab_orders_lab_access ON lab_orders
    FOR SELECT USING (
        lab_partner_id IN (
            SELECT p.id FROM partners p
            JOIN partner_users pu ON p.id = pu.partner_id
            WHERE pu.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Lab Results RLS
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY lab_results_patient_access ON lab_results
    FOR SELECT USING (
        lab_order_id IN (
            SELECT id FROM lab_orders
            WHERE patient_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Notifications RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_user_access ON notifications
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);

-- Partner Users Table
CREATE TABLE IF NOT EXISTS partner_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    partner_id UUID REFERENCES partners(id) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, partner_id)
);

ALTER TABLE partner_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_users_own_access ON partner_users
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);
