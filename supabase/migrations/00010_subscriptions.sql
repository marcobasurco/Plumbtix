-- =============================================================================
-- Work Orders — Migration 00010: Company Subscriptions + Billing Prep
-- =============================================================================
-- SaaS billing foundation:
--   1. subscription_tier enum (free, starter, professional, enterprise)
--   2. company_subscriptions table — one active sub per company
--   3. Tier-based limits (buildings, users, tickets/month)
--   4. RLS: proroto_admin sees all; pm_admin reads own company
--   5. Updated v_company_analytics view with subscription info
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Subscription tier enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM (
    'free',          -- trial / limited
    'starter',       -- small PM companies
    'professional',  -- mid-size
    'enterprise'     -- unlimited / custom
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'active',
    'past_due',
    'cancelled',
    'trialing'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Company subscriptions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tier            subscription_tier NOT NULL DEFAULT 'free',
    status          subscription_status NOT NULL DEFAULT 'trialing',
    -- Tier limits (nullable = unlimited)
    max_buildings   INT,            -- NULL = unlimited
    max_users       INT,            -- NULL = unlimited
    max_tickets_mo  INT,            -- NULL = unlimited (per month)
    max_storage_mb  INT,            -- NULL = unlimited
    -- Billing
    monthly_price_cents  INT NOT NULL DEFAULT 0,
    trial_ends_at   TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    cancelled_at    TIMESTAMPTZ,
    -- Stripe integration prep (nullable until connected)
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One active subscription per company
    CONSTRAINT company_subscriptions_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_subs_company
    ON company_subscriptions(company_id);

CREATE INDEX IF NOT EXISTS idx_company_subs_status
    ON company_subscriptions(status);

-- ---------------------------------------------------------------------------
-- 3. Seed default tiers for existing companies (free/trialing)
-- ---------------------------------------------------------------------------
INSERT INTO company_subscriptions (company_id, tier, status, max_buildings, max_users, max_tickets_mo, max_storage_mb, trial_ends_at)
SELECT
    c.id,
    'starter'::subscription_tier,
    'trialing'::subscription_status,
    10,   -- max buildings
    25,   -- max users
    100,  -- max tickets/mo
    1024, -- 1 GB storage
    NOW() + INTERVAL '30 days'
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM company_subscriptions cs WHERE cs.company_id = c.id
);

-- ---------------------------------------------------------------------------
-- 4. Auto-create subscription on new company creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_create_subscription()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO company_subscriptions (
        company_id, tier, status,
        max_buildings, max_users, max_tickets_mo, max_storage_mb,
        trial_ends_at
    ) VALUES (
        NEW.id,
        'starter',
        'trialing',
        10, 25, 100, 1024,
        NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_subscription ON companies;
CREATE TRIGGER trg_auto_create_subscription
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_create_subscription();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

-- proroto_admin: full access
CREATE POLICY company_subs_proroto_admin ON company_subscriptions
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'proroto_admin')
    );

-- pm_admin: read own company
CREATE POLICY company_subs_pm_admin_read ON company_subscriptions
    FOR SELECT
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'pm_admin')
    );

-- ---------------------------------------------------------------------------
-- 6. Updated analytics view with subscription data
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_company_analytics AS
SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.slug,
    (SELECT COUNT(*) FROM buildings b WHERE b.company_id = c.id) AS building_count,
    (SELECT COUNT(*) FROM spaces s JOIN buildings b ON b.id = s.building_id WHERE b.company_id = c.id) AS space_count,
    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
    (SELECT COUNT(*) FROM tickets t
     JOIN spaces s ON s.id = t.space_id
     JOIN buildings b ON b.id = s.building_id
     WHERE b.company_id = c.id) AS total_tickets,
    (SELECT COUNT(*) FROM tickets t
     JOIN spaces s ON s.id = t.space_id
     JOIN buildings b ON b.id = s.building_id
     WHERE b.company_id = c.id
       AND t.status NOT IN ('completed', 'invoiced', 'cancelled')) AS open_tickets,
    (SELECT COUNT(*) FROM tickets t
     JOIN spaces s ON s.id = t.space_id
     JOIN buildings b ON b.id = s.building_id
     WHERE b.company_id = c.id
       AND t.created_at >= date_trunc('month', NOW())) AS tickets_this_month,
    -- Subscription data
    cs.tier AS subscription_tier,
    cs.status AS subscription_status,
    cs.max_buildings,
    cs.max_users,
    cs.max_tickets_mo,
    cs.max_storage_mb,
    cs.monthly_price_cents,
    cs.trial_ends_at,
    cs.current_period_end
FROM companies c
LEFT JOIN company_subscriptions cs ON cs.company_id = c.id;

-- ---------------------------------------------------------------------------
-- 7. Enable realtime for subscriptions
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE company_subscriptions;
