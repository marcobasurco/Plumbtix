-- =============================================================================
-- Migration 00019: Add logo_url to companies for multi-tenant branding
-- =============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN companies.logo_url IS 'Public URL to company logo image (Supabase Storage)';

-- Create storage bucket for company logos (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read company logos') THEN
    CREATE POLICY "Public read company logos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'company-logos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'PM admins upload company logos') THEN
    CREATE POLICY "PM admins upload company logos"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'company-logos'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'PM admins delete company logos') THEN
    CREATE POLICY "PM admins delete company logos"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'company-logos'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;
