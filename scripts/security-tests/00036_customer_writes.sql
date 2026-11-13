\set ON_ERROR_STOP 0
\set QUIET on
\pset format unaligned
\pset tuples_only on
-- fixed ids
\set admin  '''00000000-0000-0000-0000-0000000000a1'''
\set pmA    '''00000000-0000-0000-0000-0000000000a2'''
\set staffA '''00000000-0000-0000-0000-0000000000a3'''
\set pmB    '''00000000-0000-0000-0000-0000000000b2'''
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES (:admin,'admin@x'),(:pmA,'pma@x'),(:staffA,'staffa@x'),(:pmB,'pmb@x');
INSERT INTO companies(id,name,slug) VALUES ('10000000-0000-0000-0000-00000000000a','Co A','co-a'),('10000000-0000-0000-0000-00000000000b','Co B','co-b');
INSERT INTO users(id,email,full_name,role,company_id) VALUES
 (:admin,'admin@x','Admin','proroto_admin',NULL),
 (:pmA,'pma@x','PM A','pm_admin','10000000-0000-0000-0000-00000000000a'),
 (:staffA,'staffa@x','Staff A','pm_user','10000000-0000-0000-0000-00000000000a'),
 (:pmB,'pmb@x','PM B','pm_admin','10000000-0000-0000-0000-00000000000b');
INSERT INTO buildings(id,company_id,address_line1,city,state,zip) VALUES
 ('20000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','1 A St','Palo Alto','CA','94301'),
 ('20000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','2 A St','Palo Alto','CA','94301'),
 ('20000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-00000000000b','1 B St','Palo Alto','CA','94301');
INSERT INTO building_entitlements(user_id,building_id) VALUES (:staffA,'20000000-0000-0000-0000-0000000000a1');
INSERT INTO technicians(name,phone) VALUES ('Tech One','+16505550101');
SELECT 'spaces per building: '||count(*) FROM spaces;

-- helper: act as a user
CREATE OR REPLACE FUNCTION pg_temp.noop() RETURNS void LANGUAGE sql AS 'select';
\echo ===== T1 staffA files a normal report through the same insert create-ticket uses → must SUCCEED
SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \gset
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type,severity,status,description)
 SELECT '20000000-0000-0000-0000-0000000000a1', s.id, auth.uid(), 'active_leak','emergency','new','Pipe burst' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1
 RETURNING 'T1 ok #'||ticket_number||' next_escalation_set='||(next_escalation_at IS NOT NULL);
\echo ===== T2 staffA lowers urgency → must FAIL
UPDATE tickets SET severity='standard' WHERE created_by_user_id=auth.uid();
\echo ===== T3 staffA rewrites description → must FAIL
UPDATE tickets SET description='nothing happened' WHERE created_by_user_id=auth.uid();
\echo ===== T4 staffA sets completed_at → must FAIL
UPDATE tickets SET completed_at=now() WHERE created_by_user_id=auth.uid();
\echo ===== T5 staffA no-op update → allowed (0 change)
UPDATE tickets SET description=description WHERE created_by_user_id=auth.uid() RETURNING 'T5 ok';
\echo ===== T6 staffA inserts already Completed → must FAIL
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type,status) SELECT '20000000-0000-0000-0000-0000000000a1', s.id, auth.uid(),'drain_clog','completed' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1;
\echo ===== T7 staffA inserts in PM A''s name → must FAIL
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type) SELECT '20000000-0000-0000-0000-0000000000a1', s.id, '00000000-0000-0000-0000-0000000000a2','drain_clog' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1;
\echo ===== T8 staffA inserts pre-acknowledged emergency → must FAIL
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type,severity,acknowledged_at,acknowledged_by_user_id) SELECT '20000000-0000-0000-0000-0000000000a1', s.id, auth.uid(),'gas_smell','emergency',now(),'00000000-0000-0000-0000-0000000000a1' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1;
\echo ===== T9 staffA inserts with a chosen number → must FAIL
INSERT INTO tickets(ticket_number,building_id,space_id,created_by_user_id,issue_type) SELECT 9999,'20000000-0000-0000-0000-0000000000a1', s.id, auth.uid(),'drain_clog' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1;
\echo ===== T10 staffA inserts pre-scheduled → must FAIL
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type,assigned_technician,scheduled_date) SELECT '20000000-0000-0000-0000-0000000000a1', s.id, auth.uid(),'drain_clog','Me','2026-12-01' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1;
\echo ===== T11 staffA inserts in building A2 (not entitled) → must FAIL (RLS)
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type) SELECT '20000000-0000-0000-0000-0000000000a2', s.id, auth.uid(),'drain_clog' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a2' LIMIT 1;
\echo ===== T12 staffA reads technicians → must be 0
SELECT 'technicians visible to staff: '||count(*) FROM technicians;
\echo ===== T13 staffA calls rate limiter → must FAIL
SELECT check_rate_limit('x',1,60);
\echo ===== T14 staffA adds own attachment → must SUCCEED; in someone else''s name → FAIL
INSERT INTO ticket_attachments(ticket_id,uploaded_by_user_id,file_path,file_name) SELECT id, auth.uid(), 'tickets/'||id||'/mine.jpg','mine.jpg' FROM tickets LIMIT 1 RETURNING 'T14a ok';
INSERT INTO ticket_attachments(ticket_id,uploaded_by_user_id,file_path,file_name) SELECT id, '00000000-0000-0000-0000-0000000000a2', 'tickets/'||id||'/fake.jpg','fake.jpg' FROM tickets LIMIT 1;

\echo ===== admin adds a Pro Roto photo, acknowledges by scheduling
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \gset
INSERT INTO ticket_attachments(ticket_id,uploaded_by_user_id,file_path,file_name) SELECT id, auth.uid(), 'tickets/'||id||'/proroto.jpg','proroto.jpg' FROM tickets LIMIT 1 RETURNING 'admin photo ok';
INSERT INTO storage.objects(bucket_id,name,owner_id) SELECT 'ticket-attachments','tickets/'||id||'/proroto.jpg','00000000-0000-0000-0000-0000000000a1' FROM tickets LIMIT 1;
INSERT INTO storage.objects(bucket_id,name,owner_id) SELECT 'ticket-attachments','tickets/'||id||'/mine.jpg','00000000-0000-0000-0000-0000000000a3' FROM tickets LIMIT 1;
UPDATE tickets SET status='scheduled', assigned_technician='Tech One', scheduled_date='2026-12-01' RETURNING 'admin schedule ok ack='||(acknowledged_at IS NOT NULL)||' paging_off='||(next_escalation_at IS NULL);
UPDATE tickets SET severity='urgent' RETURNING 'admin can change severity ok';
SELECT 'admin sees technicians: '||count(*) FROM technicians;

\echo ===== T15 PM A (same company) deletes Pro Roto photo → must delete 0 rows; storage too
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \gset
WITH d AS (DELETE FROM ticket_attachments WHERE file_name='proroto.jpg' RETURNING 1) SELECT 'T15 rows deleted by PM A: '||count(*) FROM d;
WITH d AS (DELETE FROM storage.objects WHERE name LIKE '%proroto.jpg' RETURNING 1) SELECT 'T15 storage rows deleted by PM A: '||count(*) FROM d;
SELECT 'PM A sees attachments: '||count(*) FROM ticket_attachments;
\echo ===== T16 PM B (other company) sees nothing
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false) \gset
SELECT 'PM B sees tickets: '||count(*)||' attachments: '||(SELECT count(*) FROM ticket_attachments)||' files: '||(SELECT count(*) FROM storage.objects) FROM tickets;
\echo ===== T17 staffA deletes own photo while open → 1 row, and it is logged
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \gset
WITH d AS (DELETE FROM storage.objects WHERE name LIKE '%mine.jpg' RETURNING 1) SELECT 'T17 storage rows deleted by owner: '||count(*) FROM d;
WITH d AS (DELETE FROM ticket_attachments WHERE file_name='mine.jpg' RETURNING 1) SELECT 'T17 rows deleted by owner: '||count(*) FROM d;
INSERT INTO ticket_attachments(ticket_id,uploaded_by_user_id,file_path,file_name) SELECT id, auth.uid(), 'tickets/'||id||'/mine2.jpg','mine2.jpg' FROM tickets LIMIT 1 RETURNING 'second own photo ok';
\echo ===== admin completes the job; T18 staffA can no longer delete own photo
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \gset
UPDATE tickets SET status='dispatched'; UPDATE tickets SET status='on_site'; UPDATE tickets SET status='in_progress'; UPDATE tickets SET status='completed' RETURNING 'completed ok';
SELECT 'audit rows for attachment_deleted: '||count(*)||' by '||max(changed_by::text) FROM ticket_audit_log WHERE field='attachment_deleted';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \gset
WITH d AS (DELETE FROM ticket_attachments WHERE file_name='mine2.jpg' RETURNING 1) SELECT 'T18 rows deleted after completion: '||count(*) FROM d;
\echo ===== T19 anon cannot call rate limiter; service role can
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.role','anon',false) \gset
SELECT check_rate_limit('x',1,60);
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false) \gset
SELECT 'service role rate limit: '||check_rate_limit('x',1,60);
\echo ===== T20 service role (escalation sweep) can still update paging columns
INSERT INTO tickets(building_id,space_id,created_by_user_id,issue_type,severity) SELECT '20000000-0000-0000-0000-0000000000a1', s.id,'00000000-0000-0000-0000-0000000000a3','gas_smell','emergency' FROM spaces s WHERE building_id='20000000-0000-0000-0000-0000000000a1' LIMIT 1 RETURNING 'svc insert ok armed='||(next_escalation_at IS NOT NULL);
UPDATE tickets SET escalation_step=1, next_escalation_at=now()+interval '10 min' WHERE severity='emergency' AND acknowledged_at IS NULL RETURNING 'svc claim ok step='||escalation_step;
