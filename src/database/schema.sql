-- Pledge Protocol Database Schema
-- Phase 3: Token Minting and Commemoratives
-- PostgreSQL schema for persistent storage

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CAMPAIGNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(64) PRIMARY KEY,
    chain_id VARCHAR(66),
    creator_address VARCHAR(42) NOT NULL,
    beneficiary_address VARCHAR(42) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    beneficiary_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    goal_amount NUMERIC(78, 0),
    funding_deadline TIMESTAMP WITH TIME ZONE,
    resolution_deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    total_pledged NUMERIC(78, 0) DEFAULT 0,
    total_released NUMERIC(78, 0) DEFAULT 0,
    total_refunded NUMERIC(78, 0) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'pledges_closed', 'resolved', 'expired', 'cancelled'))
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_creator ON campaigns(creator_address);
CREATE INDEX idx_campaigns_beneficiary ON campaigns(beneficiary_address);
CREATE INDEX idx_campaigns_category ON campaigns(category);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- =====================================================
-- PLEDGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS pledges (
    id VARCHAR(64) PRIMARY KEY,
    chain_id VARCHAR(66),
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    pledge_type_id VARCHAR(64) NOT NULL,
    backer_address VARCHAR(42) NOT NULL,
    backer_name VARCHAR(255),
    escrowed_amount NUMERIC(78, 0) NOT NULL,
    final_amount NUMERIC(78, 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    calculation_params JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_pledge_status CHECK (status IN ('active', 'resolved', 'refunded', 'cancelled'))
);

CREATE INDEX idx_pledges_campaign ON pledges(campaign_id);
CREATE INDEX idx_pledges_backer ON pledges(backer_address);
CREATE INDEX idx_pledges_status ON pledges(status);
CREATE INDEX idx_pledges_created_at ON pledges(created_at DESC);

-- =====================================================
-- PLEDGE TYPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS pledge_types (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    calculation_type VARCHAR(20) NOT NULL DEFAULT 'flat',
    min_amount NUMERIC(78, 0),
    max_amount NUMERIC(78, 0),
    unit_rate NUMERIC(78, 0),
    max_units INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_calc_type CHECK (calculation_type IN ('flat', 'per_unit', 'tiered', 'conditional'))
);

CREATE INDEX idx_pledge_types_campaign ON pledge_types(campaign_id);

-- =====================================================
-- MILESTONES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    oracle_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    verification_type VARCHAR(50) NOT NULL,
    condition_config JSONB NOT NULL,
    weight NUMERIC(5, 4) DEFAULT 1.0,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    oracle_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_milestones_campaign ON milestones(campaign_id);
CREATE INDEX idx_milestones_oracle ON milestones(oracle_id);

-- =====================================================
-- ORACLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS oracles (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    oracle_type VARCHAR(20) NOT NULL,
    trust_level VARCHAR(20) NOT NULL DEFAULT 'community',
    active BOOLEAN DEFAULT TRUE,
    endpoint VARCHAR(512),
    auth_config JSONB,
    query_mapping JSONB,
    response_mapping JSONB,
    poll_interval INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_oracle_type CHECK (oracle_type IN ('attestation', 'api', 'aggregator')),
    CONSTRAINT valid_trust_level CHECK (trust_level IN ('official', 'verified', 'community', 'custom'))
);

CREATE INDEX idx_oracles_type ON oracles(oracle_type);
CREATE INDEX idx_oracles_active ON oracles(active);

-- =====================================================
-- ORACLE RESPONSES CACHE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS oracle_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_id VARCHAR(64) NOT NULL REFERENCES oracles(id),
    campaign_id VARCHAR(64) REFERENCES campaigns(id),
    milestone_id VARCHAR(64) REFERENCES milestones(id),
    query_params JSONB NOT NULL,
    response_data JSONB NOT NULL,
    raw_data JSONB,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    cached BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_oracle_responses_oracle ON oracle_responses(oracle_id);
CREATE INDEX idx_oracle_responses_campaign ON oracle_responses(campaign_id);
CREATE INDEX idx_oracle_responses_milestone ON oracle_responses(milestone_id);
CREATE INDEX idx_oracle_responses_created ON oracle_responses(created_at DESC);

-- =====================================================
-- COMMEMORATIVES TABLE (Phase 3)
-- =====================================================
CREATE TABLE IF NOT EXISTS commemoratives (
    id VARCHAR(64) PRIMARY KEY,
    pledge_id VARCHAR(64) NOT NULL UNIQUE REFERENCES pledges(id),
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    backer_address VARCHAR(42) NOT NULL,
    token_id INTEGER,
    template_type VARCHAR(20) NOT NULL DEFAULT 'generic',
    metadata JSONB NOT NULL,
    image_uri VARCHAR(512) NOT NULL,
    metadata_uri VARCHAR(512) NOT NULL,
    storage_provider VARCHAR(20) NOT NULL DEFAULT 'arweave',
    minted BOOLEAN DEFAULT FALSE,
    minted_at TIMESTAMP WITH TIME ZONE,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_template_type CHECK (template_type IN ('race_finish', 'academic', 'creative', 'generic')),
    CONSTRAINT valid_storage_provider CHECK (storage_provider IN ('ipfs', 'arweave'))
);

CREATE INDEX idx_commemoratives_pledge ON commemoratives(pledge_id);
CREATE INDEX idx_commemoratives_campaign ON commemoratives(campaign_id);
CREATE INDEX idx_commemoratives_backer ON commemoratives(backer_address);
CREATE INDEX idx_commemoratives_minted ON commemoratives(minted);
CREATE INDEX idx_commemoratives_token_id ON commemoratives(token_id);
CREATE INDEX idx_commemoratives_created ON commemoratives(created_at DESC);

-- =====================================================
-- PLEDGE TOKENS TABLE (Phase 3)
-- =====================================================
CREATE TABLE IF NOT EXISTS pledge_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pledge_id VARCHAR(64) NOT NULL UNIQUE REFERENCES pledges(id),
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    token_id INTEGER NOT NULL,
    backer_address VARCHAR(42) NOT NULL,
    metadata JSONB NOT NULL,
    image_uri VARCHAR(512) NOT NULL,
    metadata_uri VARCHAR(512) NOT NULL,
    storage_provider VARCHAR(20) NOT NULL DEFAULT 'ipfs',
    minted BOOLEAN DEFAULT FALSE,
    minted_at TIMESTAMP WITH TIME ZONE,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_token_storage CHECK (storage_provider IN ('ipfs', 'arweave'))
);

CREATE INDEX idx_pledge_tokens_pledge ON pledge_tokens(pledge_id);
CREATE INDEX idx_pledge_tokens_campaign ON pledge_tokens(campaign_id);
CREATE INDEX idx_pledge_tokens_backer ON pledge_tokens(backer_address);
CREATE INDEX idx_pledge_tokens_token_id ON pledge_tokens(token_id);

-- =====================================================
-- RESOLUTION JOBS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS resolution_jobs (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    triggered_by VARCHAR(20) NOT NULL,
    milestones_verified INTEGER DEFAULT 0,
    milestones_failed INTEGER DEFAULT 0,
    pledges_resolved INTEGER DEFAULT 0,
    total_released NUMERIC(78, 0) DEFAULT 0,
    total_refunded NUMERIC(78, 0) DEFAULT 0,
    commemoratives_minted INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_job_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT valid_trigger_type CHECK (triggered_by IN ('manual', 'webhook', 'poll', 'schedule'))
);

CREATE INDEX idx_resolution_jobs_campaign ON resolution_jobs(campaign_id);
CREATE INDEX idx_resolution_jobs_status ON resolution_jobs(status);
CREATE INDEX idx_resolution_jobs_created ON resolution_jobs(created_at DESC);

-- =====================================================
-- WEBHOOK EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_id VARCHAR(64) NOT NULL REFERENCES oracles(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(256),
    nonce VARCHAR(64),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_oracle ON webhook_events(oracle_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_nonce ON webhook_events(nonce);

-- =====================================================
-- STORAGE RECORDS TABLE (for tracking uploads)
-- =====================================================
CREATE TABLE IF NOT EXISTS storage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_hash VARCHAR(64) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    uri VARCHAR(512) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_provider CHECK (provider IN ('ipfs', 'arweave'))
);

CREATE INDEX idx_storage_records_hash ON storage_records(content_hash);
CREATE INDEX idx_storage_records_entity ON storage_records(entity_type, entity_id);
CREATE INDEX idx_storage_records_provider ON storage_records(provider);

-- =====================================================
-- VIEWS
-- =====================================================

-- Campaign summary view
CREATE OR REPLACE VIEW campaign_summary AS
SELECT
    c.id,
    c.subject_name,
    c.beneficiary_name,
    c.category,
    c.status,
    c.goal_amount,
    c.total_pledged,
    COUNT(DISTINCT p.id) as pledge_count,
    COUNT(DISTINCT CASE WHEN p.status = 'resolved' THEN p.id END) as resolved_pledges,
    COUNT(DISTINCT cm.id) as commemorative_count,
    c.created_at,
    c.resolved_at
FROM campaigns c
LEFT JOIN pledges p ON c.id = p.campaign_id
LEFT JOIN commemoratives cm ON c.id = cm.campaign_id
GROUP BY c.id;

-- Backer portfolio view
CREATE OR REPLACE VIEW backer_portfolio AS
SELECT
    p.backer_address,
    c.id as campaign_id,
    c.subject_name as campaign_name,
    p.id as pledge_id,
    p.escrowed_amount,
    p.final_amount,
    p.status as pledge_status,
    cm.id as commemorative_id,
    cm.image_uri as commemorative_image,
    cm.minted as commemorative_minted
FROM pledges p
JOIN campaigns c ON p.campaign_id = c.id
LEFT JOIN commemoratives cm ON p.id = cm.pledge_id;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Update campaign totals on pledge changes
CREATE OR REPLACE FUNCTION update_campaign_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE campaigns
        SET total_pledged = total_pledged + NEW.escrowed_amount
        WHERE id = NEW.campaign_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
            UPDATE campaigns
            SET total_released = total_released + COALESCE(NEW.final_amount, 0)
            WHERE id = NEW.campaign_id;
        ELSIF NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
            UPDATE campaigns
            SET total_refunded = total_refunded + NEW.escrowed_amount
            WHERE id = NEW.campaign_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pledge_totals_trigger
AFTER INSERT OR UPDATE ON pledges
FOR EACH ROW EXECUTE FUNCTION update_campaign_totals();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SAMPLE DATA (for development/testing)
-- =====================================================

-- Insert sample oracle configurations
INSERT INTO oracles (id, name, description, oracle_type, trust_level, endpoint)
VALUES
    ('athlinks', 'Athlinks Race Timing', 'Official race timing results from Athlinks', 'api', 'official', 'https://api.athlinks.com'),
    ('github', 'GitHub API', 'GitHub PR and commit verification', 'api', 'official', 'https://api.github.com'),
    ('manual', 'Manual Attestation', 'Human attestor verification', 'attestation', 'verified', NULL)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PERMISSIONS (example for application role)
-- =====================================================

-- Create application role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pledge_app') THEN
        CREATE ROLE pledge_app WITH LOGIN PASSWORD 'changeme';
    END IF;
END
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pledge_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pledge_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pledge_app;
