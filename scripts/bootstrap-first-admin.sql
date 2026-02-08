-- =============================================================================
-- PlumbTix — First Admin Bootstrap (run ONCE)
-- =============================================================================
--
-- 1. Create auth.users record via Supabase Dashboard > Authentication > Add User
-- 2. Copy the generated UUID
-- 3. Replace placeholders below
-- 4. Run in Supabase Studio SQL Editor
--
-- Pro Roto company UUID from Section 7 seed: 00000000-0000-0000-0000-000000000001
-- =============================================================================

INSERT INTO public.users (id, email, full_name, phone, role, company_id)
VALUES (
    'YOUR_AUTH_USER_UUID'::uuid,           -- ← from auth.users
    'admin@proroto.com',                   -- ← real admin email
    'Marco',                               -- ← real admin name
    NULL,
    'proroto_admin',
    '00000000-0000-0000-0000-000000000001'
);

-- Verify
SELECT id, email, full_name, role, company_id FROM public.users WHERE role = 'proroto_admin';
