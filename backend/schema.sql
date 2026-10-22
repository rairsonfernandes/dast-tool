-- ============================================================
-- SENTINEL — PostgreSQL Schema (Production Ready)
-- ============================================================
-- Requer PostgreSQL 14+
-- Multi-tenancy via Row-Level Security (RLS)
--
-- Execução:
--   psql -U postgres -d sentinel -f schema.sql
--
-- Role da aplicação:
--   CREATE ROLE sentinel_app LOGIN PASSWORD '...';
--   NUNCA uses superuser nem BYPASSRLS em produção.
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(120) NOT NULL,
    slug                  VARCHAR(80) UNIQUE NOT NULL,
    plan                  VARCHAR(32) NOT NULL DEFAULT 'free', -- free | business | enterprise
    max_users             INTEGER NOT NULL DEFAULT 1,
    max_scans_per_month   INTEGER NOT NULL DEFAULT 3,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = TRUE;

-- ============================================================
-- USERS (multi-tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),                              -- NULL se OAuth
    name            VARCHAR(120),
    role            VARCHAR(32) NOT NULL DEFAULT 'ANALYST',   -- SUPER_ADMIN | ADMIN | ANALYST | VIEWER
    phone           VARCHAR(32),
    department      VARCHAR(120),
    job_title       VARCHAR(120),
    provider        VARCHAR(32),                              -- google | github | NULL
    provider_id     VARCHAR(255),
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email),
    CONSTRAINT chk_users_role CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER'))
);

CREATE INDEX IF NOT EXISTS idx_users_tenant   ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_users_active   ON users(tenant_id, is_active) WHERE is_active = TRUE;

-- ============================================================
-- SCANS
-- ============================================================
CREATE TABLE IF NOT EXISTS scans (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_url        VARCHAR(2048) NOT NULL,
    profile           VARCHAR(32) NOT NULL DEFAULT 'owasp_top10',
                      -- owasp_top10 | full | api | infra
    status            VARCHAR(32) NOT NULL DEFAULT 'queued',
                      -- queued | pending | running | completed | failed | paused
    score             INTEGER,
    progress          INTEGER NOT NULL DEFAULT 0,
    result            TEXT,                                  -- JSON serializado (payload do scan)
    error_message     TEXT,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    duration_seconds  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_scans_status CHECK (
        status IN ('queued', 'pending', 'running', 'completed', 'failed', 'paused')
    ),
    CONSTRAINT chk_scans_progress CHECK (progress BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_scans_tenant       ON scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scans_user         ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status       ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created      ON scans(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_running      ON scans(tenant_id) WHERE status = 'running';

-- ============================================================
-- VULNERABILITIES (findings)
-- ============================================================
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scan_id         UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    severity        VARCHAR(16) NOT NULL,                    -- critical | high | medium | low | info
    title           VARCHAR(255) NOT NULL,
    cwe             VARCHAR(32),
    cvss            NUMERIC(3,1),
    description     TEXT,
    evidence        TEXT,
    remediation     TEXT,
    affected_url    VARCHAR(2048),
    status          VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending | fixing | fixed | ignored
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fixed_at        TIMESTAMPTZ,
    CONSTRAINT chk_vulns_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    CONSTRAINT chk_vulns_status   CHECK (status IN ('pending', 'fixing', 'fixed', 'ignored')),
    CONSTRAINT chk_vulns_cvss     CHECK (cvss IS NULL OR (cvss >= 0 AND cvss <= 10))
);

CREATE INDEX IF NOT EXISTS idx_vulns_tenant   ON vulnerabilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vulns_scan     ON vulnerabilities(scan_id);
CREATE INDEX IF NOT EXISTS idx_vulns_severity ON vulnerabilities(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_vulns_status   ON vulnerabilities(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vulns_open     ON vulnerabilities(tenant_id) WHERE status IN ('pending', 'fixing');

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scan_id         UUID REFERENCES scans(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(32) NOT NULL DEFAULT 'executive',
                    -- executive | technical | compliance | incident
    format          VARCHAR(8) NOT NULL DEFAULT 'pdf',       -- pdf | csv
    file_path       TEXT,
    file_size_bytes INTEGER,
    status          VARCHAR(16) NOT NULL DEFAULT 'generating',
                    -- generating | ready | failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_reports_format CHECK (format IN ('pdf', 'csv')),
    CONSTRAINT chk_reports_status CHECK (status IN ('generating', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_scan   ON reports(scan_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(tenant_id, created_at DESC);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    key_hash        VARCHAR(255) UNIQUE NOT NULL,
    key_prefix      VARCHAR(16) NOT NULL DEFAULT 'sk_live_',
    key_last_chars  VARCHAR(8)  NOT NULL DEFAULT '0000',
    permissions     VARCHAR(32) NOT NULL DEFAULT 'read',      -- read | read_write | full
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_api_keys_permissions CHECK (permissions IN ('read', 'read_write', 'full'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- PASSWORD RESET TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_cleanup ON password_reset_tokens(expires_at) WHERE used = FALSE;

-- ============================================================
-- USER SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device          VARCHAR(255),
    location        VARCHAR(255),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user         ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant       ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active       ON user_sessions(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_last_active  ON user_sessions(user_id, last_active_at DESC);

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(80) NOT NULL,
    resource_type   VARCHAR(80),
    resource_id     UUID,
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant  ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin ON audit_logs USING GIN (metadata);

-- ============================================================
-- TENANT SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    settings_json   TEXT NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);

-- ============================================================
-- THREAT EVENTS (opcional — alimenta "Ameaças Bloqueadas")
-- ============================================================
CREATE TABLE IF NOT EXISTS threat_events (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_ip   VARCHAR(45),
    kind        VARCHAR(64),
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threat_events_tenant ON threat_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_events_kind   ON threat_events(tenant_id, kind);

-- ============================================================
-- HOST METRICS (opcional — alimenta "Saúde do Sistema")
-- ============================================================
CREATE TABLE IF NOT EXISTS host_metrics (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hostname        VARCHAR(255),
    cpu             INTEGER,
    ram             INTEGER,
    disk            INTEGER,
    network         INTEGER,
    region          VARCHAR(64),
    version         VARCHAR(32),
    uptime_days     INTEGER,
    last_backup_at  TIMESTAMPTZ,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_host_cpu CHECK (cpu IS NULL OR cpu BETWEEN 0 AND 100),
    CONSTRAINT chk_host_ram CHECK (ram IS NULL OR ram BETWEEN 0 AND 100),
    CONSTRAINT chk_host_disk CHECK (disk IS NULL OR disk BETWEEN 0 AND 100),
    CONSTRAINT chk_host_network CHECK (network IS NULL OR network BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_host_metrics_tenant ON host_metrics(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_host_metrics_latest ON host_metrics(tenant_id, recorded_at DESC) 
    WHERE recorded_at > NOW() - INTERVAL '1 day';

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenants', 'users', 'scans', 'tenant_settings']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — MULTI-TENANCY
-- ============================================================
-- O role da aplicação NÃO pode ser superuser nem ter BYPASSRLS.
-- O tenant é definido por request via:
--   SELECT set_config('app.current_tenant_id', '<uuid>', true);
-- (usa o terceiro argumento `true` para scope de transação)
--
-- Se `app.current_tenant_id` estiver vazio, NULLIF(...) devolve NULL,
-- e a policy bloqueia tudo — comportamento seguro por omissão.
-- ============================================================

-- USERS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- SCANS
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scans_tenant_isolation ON scans;
CREATE POLICY scans_tenant_isolation ON scans
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- VULNERABILITIES
ALTER TABLE vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerabilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vulns_tenant_isolation ON vulnerabilities;
CREATE POLICY vulns_tenant_isolation ON vulnerabilities
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- REPORTS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_tenant_isolation ON reports;
CREATE POLICY reports_tenant_isolation ON reports
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- API KEYS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;
CREATE POLICY api_keys_tenant_isolation ON api_keys
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- PASSWORD RESET TOKENS
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reset_tokens_tenant_isolation ON password_reset_tokens;
CREATE POLICY reset_tokens_tenant_isolation ON password_reset_tokens
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- USER SESSIONS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_tenant_isolation ON user_sessions;
CREATE POLICY sessions_tenant_isolation ON user_sessions
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- TENANT SETTINGS
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_settings_isolation ON tenant_settings;
CREATE POLICY tenant_settings_isolation ON tenant_settings
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- THREAT EVENTS
ALTER TABLE threat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS threat_events_isolation ON threat_events;
CREATE POLICY threat_events_isolation ON threat_events
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- HOST METRICS
ALTER TABLE host_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_metrics_isolation ON host_metrics;
CREATE POLICY host_metrics_isolation ON host_metrics
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- AUDIT LOGS: append-only, sem RLS.
-- Apenas o role `sentinel_admin` (ou superuser) pode ler em produção.
-- O role `sentinel_app` pode INSERT mas não SELECT.
-- (configura os GRANTs abaixo)

-- ============================================================
-- ROLES E GRANTS
-- ============================================================
-- Em produção, corre isto uma vez como superuser, DEPOIS aplica o schema.
--
--   CREATE ROLE sentinel_app LOGIN PASSWORD 'change-me';
--   CREATE ROLE sentinel_admin LOGIN PASSWORD 'change-me-too';
--   GRANT CONNECT ON DATABASE sentinel TO sentinel_app, sentinel_admin;
--   GRANT USAGE ON SCHEMA public TO sentinel_app, sentinel_admin;
--
-- O bloco abaixo (comentado) deve ser corrido após o CREATE ROLE.
-- Remove os comentários e corre num segundo passo.

/*
-- sentinel_app: role da aplicação
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sentinel_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sentinel_app;
REVOKE SELECT ON audit_logs FROM sentinel_app;
GRANT INSERT ON audit_logs TO sentinel_app;
REVOKE DELETE, UPDATE, TRUNCATE ON audit_logs FROM sentinel_app;

-- sentinel_admin: role de leitura de auditoria
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sentinel_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sentinel_admin;

-- Defaults para tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sentinel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO sentinel_app;
*/

-- ============================================================
-- DADOS INICIAIS
-- ============================================================
-- Tenant default
INSERT INTO tenants (id, name, slug, plan, max_users, max_scans_per_month)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Sentinel Default',
    'sentinel',
    'enterprise',
    999,
    99999
) ON CONFLICT (slug) DO NOTHING;

-- Tenant settings default
INSERT INTO tenant_settings (tenant_id, settings_json)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '{"theme":"dark","language":"pt-PT","timezone":"Europe/Lisbon","date_format":"DD/MM/YYYY","density":"normal","channel":"email","session_timeout":30,"scan_profile":"owasp_top10","scan_depth":"normal","rate_limit":50,"toggles":{"2fa":true,"ip-block":true,"new-device":true,"sso":false,"realtime":true,"daily":true,"scan-done":true,"integrations":false,"crawl":true,"auto-pdf":true}}'
) ON CONFLICT (tenant_id) DO NOTHING;

-- Admin inicial (password: ChangeMe!2026 — troca IMEDIATAMENTE)
-- O hash bcrypt é gerado externamente (Python) para evitar dependência do pgcrypto
-- Este exemplo é apenas ilustrativo; usa seed.py para criar o admin real.
-- INSERT INTO users (tenant_id, email, password_hash, name, role)
-- VALUES (
--     '00000000-0000-0000-0000-000000000001',
--     'admin@sentinel.sec',
--     '$2b$12$REPLACE_WITH_REAL_BCRYPT_HASH',
--     'Administrator',
--     'SUPER_ADMIN'
-- ) ON CONFLICT (tenant_id, email) DO NOTHING;

-- ============================================================
-- FIM
-- ============================================================