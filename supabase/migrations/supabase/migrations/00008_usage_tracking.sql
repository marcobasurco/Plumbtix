-- =============================================================================
-- Work Orders — Migration 00008: Usage Tracking + Company Analytics
-- =============================================================================
-- Adds per-company usage metrics for SaaS billing/analytics:
--   1. company_usage_monthly — monthly aggregated metrics per company
--   2. Trigger to auto-increment ticket_count on ticket creation
--   3. View for dashboard analytics with company breakdown
--
-- This is ADDITIVE — no existing tables are modified.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Company usage tracking table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_usage_monthly (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period      DATE NOT NULL,  -- first day of month (e.g. 2026-02-01)
    ticket_count    INT NOT NULL DEFAULT 0,
    building_count  INT NOT NULL DEFAULT 0,
    space_count     INT NOT NULL DEFAULT 0,
    user_count      INT NOT NULL DEFAULT 0,
    attachment_bytes BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT company_usage_monthly_unique UNIQUE (company_id, period)
);

-- Index for fast lookups by company + period
CREATE INDEX IF NOT EXISTS idx_company_usage_monthly_company
    ON company_usage_monthly(company_id, period DESC);

-- ---------------------------------------------------------------------------
-- 2. Trigger: auto-update ticket_count on ticket creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_track_ticket_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_company_id UUID;
    v_period     DATE;
BEGIN
    -- Get company_id from the building → space chain
    SELECT b.company_id INTO v_company_id
    FROM spaces s
    JOIN buildings b ON b.id = s.building_id
    WHERE s.id = NEW.space_id;

    IF v_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_period := date_trunc('month', NEW.created_at)::DATE;

    INSERT INTO company_usage_monthly (company_id, period, ticket_count)
    VALUES (v_company_id, v_period, 1)
    ON CONFLICT (company_id, period)
    DO UPDATE SET
        ticket_count = company_usage_monthly.ticket_count + 1,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_track_ticket_usage ON tickets;
CREATE TRIGGER trg_track_ticket_usage
    AFTER INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION fn_track_ticket_usage();

-- ---------------------------------------------------------------------------
-- 3. Function: snapshot current counts for a company
--    Call periodically (cron) or on-demand from dashboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_snapshot_company_usage(p_company_id UUID)
RETURNS VOID AS $$
DECLARE
    v_period DATE := date_trunc('month', NOW())::DATE;
    v_buildings INT;
    v_spaces INT;
    v_users INT;
    v_bytes BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_buildings
    FROM buildings WHERE company_id = p_company_id;

    SELECT COUNT(*) INTO v_spaces
    FROM spaces s
    JOIN buildings b ON b.id = s.building_id
    WHERE b.company_id = p_company_id;

    SELECT COUNT(*) INTO v_users
    FROM users WHERE company_id = p_company_id;

    -- Storage: approximate from ticket_attachments file_size
    SELECT COALESCE(SUM(ta.file_size), 0) INTO v_bytes
    FROM ticket_attachments ta
    JOIN tickets t ON t.id = ta.ticket_id
    JOIN spaces sp ON sp.id = t.space_id
    JOIN buildings bld ON bld.id = sp.building_id
    WHERE bld.company_id = p_company_id
      AND ta.created_at >= v_period;

    INSERT INTO company_usage_monthly (company_id, period, building_count, space_count, user_count, attachment_bytes)
    VALUES (p_company_id, v_period, v_buildings, v_spaces, v_users, v_bytes)
    ON CONFLICT (company_id, period)
    DO UPDATE SET
        building_count = v_buildings,
        space_count = v_spaces,
        user_count = v_users,
        attachment_bytes = v_bytes,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. RLS for company_usage_monthly
-- ---------------------------------------------------------------------------

ALTER TABLE company_usage_monthly ENABLE ROW LEVEL SECURITY;

-- proroto_admin: see all
CREATE POLICY company_usage_proroto_admin_all ON company_usage_monthly
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'proroto_admin')
    );

-- pm_admin: see own company
CREATE POLICY company_usage_pm_admin_select ON company_usage_monthly
    FOR SELECT
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'pm_admin')
    );

-- ---------------------------------------------------------------------------
-- 5. Convenience view for dashboard analytics
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
       AND t.created_at >= date_trunc('month', NOW())) AS tickets_this_month
FROM companies c;
