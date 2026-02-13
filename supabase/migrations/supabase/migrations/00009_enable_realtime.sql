-- =============================================================================
-- Work Orders — Migration 00009: Enable Realtime Publications
-- =============================================================================
-- Supabase Realtime requires tables to be added to the supabase_realtime
-- publication. Without this, postgres_changes subscriptions return nothing.
-- =============================================================================

-- Add tables to the realtime publication
-- (supabase_realtime publication is created by default in Supabase projects)
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE spaces;
ALTER PUBLICATION supabase_realtime ADD TABLE occupants;
ALTER PUBLICATION supabase_realtime ADD TABLE building_entitlements;
ALTER PUBLICATION supabase_realtime ADD TABLE companies;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE invitations;
