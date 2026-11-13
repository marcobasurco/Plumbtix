# Security tests (plain Postgres, no Supabase needed)

Proof for migration 00036: what a customer login can and cannot do when it
talks to the database directly.

```bash
createdb t
psql -d t -v ON_ERROR_STOP=1 -f scripts/security-tests/supabase-stubs.sql
for f in supabase/migrations/000*.sql; do
  sed 's/CREATE EXTENSION IF NOT EXISTS pg_cron;//; s/CREATE EXTENSION IF NOT EXISTS pg_net;//' "$f" | psql -d t -q
done
psql -d t -f scripts/security-tests/00036_customer_writes.sql
```

`supabase-stubs.sql` stands in for what Supabase provides (the `anon` /
`authenticated` / `service_role` roles, `auth.uid()`, `auth.role()`,
`storage.objects`, Vault, pg_cron). Each case in the test file prints what
must happen ("must FAIL", "must SUCCEED", "0 rows"); read the output against
those lines. Last run: 2026-11-12, PostgreSQL 16, all 36 migrations applied
cleanly and every case behaved as labelled.

Next step (open item): turn this into assertions and run it in CI.
