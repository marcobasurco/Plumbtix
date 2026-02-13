-- ============================================================================
-- SECTION 4 — v1.0.0 — FINAL / LOCKED — IDEMPOTENT — SCHEMA ONLY — NO TRIGGERS/RLS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='user_role') THEN
CREATE TYPE user_role AS ENUM('proroto_admin','pm_admin','pm_user','resident');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='space_type') THEN
CREATE TYPE space_type AS ENUM('unit','common_area');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='common_area_type') THEN
CREATE TYPE common_area_type AS ENUM('boiler_room','pool','garage','roof','crawlspace','laundry','water_room','other');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='occupant_type') THEN
CREATE TYPE occupant_type AS ENUM('homeowner','tenant');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='issue_type') THEN
CREATE TYPE issue_type AS ENUM('active_leak','sewer_backup','drain_clog','water_heater','gas_smell','toilet_faucet_shower','other_plumbing');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ticket_severity') THEN
CREATE TYPE ticket_severity AS ENUM('emergency','urgent','standard');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ticket_status') THEN
CREATE TYPE ticket_status AS ENUM('new','needs_info','scheduled','dispatched','on_site','in_progress','waiting_approval','completed','invoiced','cancelled');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='invitation_role') THEN
CREATE TYPE invitation_role AS ENUM('pm_admin','pm_user');
END IF; END $$;

CREATE TABLE IF NOT EXISTS companies (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(100) NOT NULL,
    settings   JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='companies_slug_key') THEN
ALTER TABLE companies ADD CONSTRAINT companies_slug_key UNIQUE(slug);
END IF; END $$;

CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    full_name  VARCHAR(255) NOT NULL,
    phone      VARCHAR(20),
    role       user_role NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_email_key') THEN
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE(email);
END IF; END $$;

CREATE TABLE IF NOT EXISTS buildings (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                   VARCHAR(255),
    address_line1          VARCHAR(255) NOT NULL,
    address_line2          VARCHAR(255),
    city                   VARCHAR(100) NOT NULL,
    state                  CHAR(2) NOT NULL,
    zip                    VARCHAR(10) NOT NULL,
    gate_code              VARCHAR(50),
    water_shutoff_location VARCHAR(500),
    gas_shutoff_location   VARCHAR(500),
    onsite_contact_name    VARCHAR(255),
    onsite_contact_phone   VARCHAR(20),
    access_notes           TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spaces (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id      UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    space_type       space_type NOT NULL,
    unit_number      VARCHAR(20),
    common_area_type common_area_type,
    floor            INTEGER,
    bedrooms         INTEGER,
    bathrooms        NUMERIC(3,1),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='spaces_unit_number_check') THEN
ALTER TABLE spaces ADD CONSTRAINT spaces_unit_number_check CHECK(
    (space_type='unit'        AND unit_number IS NOT NULL AND common_area_type IS NULL)
    OR
    (space_type='common_area' AND unit_number IS NULL     AND common_area_type IS NOT NULL)
);
END IF; END $$;

CREATE TABLE IF NOT EXISTS occupants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id       UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    occupant_type  occupant_type NOT NULL,
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    phone          VARCHAR(20),
    invite_token   UUID,
    invite_sent_at TIMESTAMPTZ,
    claimed_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='occupants_invite_token_key') THEN
ALTER TABLE occupants ADD CONSTRAINT occupants_invite_token_key UNIQUE(invite_token);
END IF; END $$;

CREATE TABLE IF NOT EXISTS building_entitlements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='building_entitlements_user_building_unique') THEN
ALTER TABLE building_entitlements ADD CONSTRAINT building_entitlements_user_building_unique UNIQUE(user_id,building_id);
END IF; END $$;

CREATE TABLE IF NOT EXISTS invitations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email              VARCHAR(255) NOT NULL,
    name               VARCHAR(255) NOT NULL,
    role               invitation_role NOT NULL,
    token              UUID NOT NULL DEFAULT gen_random_uuid(),
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at         TIMESTAMPTZ NOT NULL,
    accepted_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invitations_token_key') THEN
ALTER TABLE invitations ADD CONSTRAINT invitations_token_key UNIQUE(token);
END IF; END $$;

CREATE TABLE IF NOT EXISTS tickets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number         SERIAL,
    building_id           UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
    space_id              UUID NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
    created_by_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issue_type            issue_type NOT NULL,
    severity              ticket_severity NOT NULL DEFAULT 'standard',
    status                ticket_status NOT NULL DEFAULT 'new',
    description           TEXT,
    access_instructions   TEXT,
    scheduling_preference JSONB,
    assigned_technician   VARCHAR(255),
    scheduled_date        DATE,
    scheduled_time_window VARCHAR(100),
    quote_amount          NUMERIC(10,2),
    invoice_number        VARCHAR(100),
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tickets_ticket_number_key') THEN
ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_number_key UNIQUE(ticket_number);
END IF; END $$;

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_path           TEXT NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    file_type           VARCHAR(100),
    file_size           INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    comment_text TEXT NOT NULL,
    is_internal  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_status_log (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id          UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    old_status         ticket_status,
    new_status         ticket_status NOT NULL,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES (28 idx_*)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_company_id                  ON users(company_id);                                                                   -- [1]
CREATE INDEX IF NOT EXISTS idx_users_role                        ON users(role);                                                                          -- [2]
CREATE INDEX IF NOT EXISTS idx_buildings_company_id              ON buildings(company_id);                                                                -- [3]
CREATE INDEX IF NOT EXISTS idx_spaces_building_id                ON spaces(building_id);                                                                 -- [4]
CREATE INDEX IF NOT EXISTS idx_spaces_space_type                 ON spaces(space_type);                                                                  -- [5]
CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_building_unit_unique ON spaces(building_id,unit_number) WHERE space_type='unit' AND unit_number IS NOT NULL;  -- [6]
CREATE INDEX IF NOT EXISTS idx_occupants_space_id                ON occupants(space_id);                                                                 -- [7]
CREATE INDEX IF NOT EXISTS idx_occupants_user_id                 ON occupants(user_id);                                                                  -- [8]
CREATE INDEX IF NOT EXISTS idx_occupants_email                   ON occupants(email);                                                                    -- [9]
CREATE INDEX IF NOT EXISTS idx_occupants_invite_token            ON occupants(invite_token) WHERE invite_token IS NOT NULL;                               -- [10]
CREATE INDEX IF NOT EXISTS idx_building_entitlements_user_id     ON building_entitlements(user_id);                                                      -- [11]
CREATE INDEX IF NOT EXISTS idx_building_entitlements_building_id ON building_entitlements(building_id);                                                   -- [12]
CREATE INDEX IF NOT EXISTS idx_invitations_company_id            ON invitations(company_id);                                                             -- [13]
CREATE INDEX IF NOT EXISTS idx_invitations_email                 ON invitations(email);                                                                   -- [14]
CREATE INDEX IF NOT EXISTS idx_tickets_building_id               ON tickets(building_id);                                                                -- [15]
CREATE INDEX IF NOT EXISTS idx_tickets_space_id                  ON tickets(space_id);                                                                   -- [16]
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_user_id        ON tickets(created_by_user_id);                                                         -- [17]
CREATE INDEX IF NOT EXISTS idx_tickets_status                    ON tickets(status);                                                                      -- [18]
CREATE INDEX IF NOT EXISTS idx_tickets_severity                  ON tickets(severity);                                                                    -- [19]
CREATE INDEX IF NOT EXISTS idx_tickets_issue_type                ON tickets(issue_type);                                                                  -- [20]
CREATE INDEX IF NOT EXISTS idx_tickets_created_at                ON tickets(created_at DESC);                                                             -- [21]
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id      ON ticket_attachments(ticket_id);                                                       -- [22]
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by    ON ticket_attachments(uploaded_by_user_id);                                              -- [23]
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_file_path      ON ticket_attachments(file_path);                                                       -- [24]
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id         ON ticket_comments(ticket_id);                                                          -- [25]
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id           ON ticket_comments(user_id);                                                             -- [26]
CREATE INDEX IF NOT EXISTS idx_ticket_status_log_ticket_id       ON ticket_status_log(ticket_id);                                                        -- [27]
CREATE INDEX IF NOT EXISTS idx_ticket_status_log_created_at      ON ticket_status_log(created_at DESC);                                                   -- [28]

-- =============================================================================
-- VERIFICATION (run manually after execution)
-- =============================================================================
-- SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename IN('companies','users','buildings','spaces','occupants','building_entitlements','invitations','tickets','ticket_attachments','ticket_comments','ticket_status_log');
-- expect: 11
--
-- SELECT COUNT(*) FROM pg_type WHERE typtype='e' AND typname IN('user_role','space_type','common_area_type','occupant_type','issue_type','ticket_severity','ticket_status','invitation_role');
-- expect: 8
--
-- SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%';
-- expect: 28
--
-- SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_spaces_building_unit_unique';
-- expect: 1 row — partial unique on (building_id,unit_number) where space_type='unit'
--
-- SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_occupants_invite_token';
-- expect: 1 row — partial where invite_token is not null
--
-- SELECT COUNT(*) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT tgisinternal;
-- expect: 0
--
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;
-- expect: 0 rows
