-- ============================================================================
-- MIGRATION 00025 — ADDITIVE — DATABASE-BACKED RATE LIMITING
-- ============================================================================
--
-- Supabase Edge spins up a fresh isolate per request, so in-memory counters
-- reset every call and can't rate-limit. This moves the counter to the
-- database, where it's shared across all isolates.
--
-- Design: fixed-window counter, one row per (bucket, window-start). A
-- SECURITY DEFINER function does the check-and-increment atomically in a
-- single round-trip, so concurrent requests can't race past the limit.
--
-- Access: the function is the ONLY interface; the table has RLS enabled with
-- no policies, so nothing can read/write it directly except the definer
-- function (owner) and the service role. Edge functions call the RPC.
--
-- PURELY ADDITIVE: 1 table + 1 function. No changes to existing objects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) COUNTER TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
    bucket        TEXT        NOT NULL,   -- e.g. 'get-public-ticket:172.0.0.1'
    window_start  TIMESTAMPTZ NOT NULL,   -- truncated to the window
    count         INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
);

-- Enable RLS with NO policies → table is inaccessible except to the
-- SECURITY DEFINER function below and the service role.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limit_counters IS
    'Fixed-window rate-limit counters shared across edge isolates. Written only via check_rate_limit().';

-- ---------------------------------------------------------------------------
-- B) ATOMIC CHECK-AND-INCREMENT
-- ---------------------------------------------------------------------------
-- Returns TRUE if the request is ALLOWED, FALSE if the limit is exceeded.
-- One round-trip, race-safe via INSERT ... ON CONFLICT DO UPDATE RETURNING.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_bucket      TEXT,
    p_limit       INTEGER,
    p_window_secs INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count        INTEGER;
BEGIN
    -- Bucket the current time into a fixed window boundary
    v_window_start := to_timestamp(
        floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs
    );

    INSERT INTO public.rate_limit_counters (bucket, window_start, count)
    VALUES (p_bucket, v_window_start, 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET count = public.rate_limit_counters.count + 1
    RETURNING count INTO v_count;

    -- Opportunistic cleanup of old windows (cheap, keeps the table tiny).
    -- Only runs occasionally to avoid overhead on every call.
    IF random() < 0.01 THEN
        DELETE FROM public.rate_limit_counters
        WHERE window_start < now() - INTERVAL '1 hour';
    END IF;

    RETURN v_count <= p_limit;
END;
$$;

-- Allow the anon/authenticated roles used by edge functions to call it.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO anon, authenticated, service_role;
