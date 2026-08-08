# Database migrations

Migration files are ordered, immutable SQL files named:

```text
NNN_descriptive_name.sql
```

Run all pending migrations before starting the API:

```bash
npm run migrate
```

Inspect migration status:

```bash
npm run migrate:status
```

The runner:

- Acquires a PostgreSQL advisory lock.
- Creates the migration ledger if it does not exist.
- Verifies checksums for already-applied files.
- Runs each pending migration in its own transaction.
- Records the filename, SHA-256 checksum, and completion time.
- Rolls back the active migration if it fails.

Applied migration files must never be edited. Add a new ordered migration for
every subsequent schema change.

Current migrations:

1. `001_initial_schema.sql` — compatible baseline tables.
2. `002_identity_authorization_foundation.sql` — sessions, legacy role and
   ownership foundations.
3. `003_authorized_recovery_workflow.sql` — normalized roles, preferred
   workspace, lifecycle states, durable matches/notifications, claim
   expiration/history, and private Admin Notes.
4. `004_transactional_recovery_lifecycle.sql` — durable student identifiers,
   verification/resubmission fields, return/archive timestamps, expanded
   lifecycle states, and supporting indexes.
5. `005_report_workspace_refinement.sql` — normalized ordered report photos
   with compatibility backfill from the legacy primary image.
6. `006_manual_claim_entry.sql` — report-independent manual claims with
   validated item context and an Admin review-queue index.
7. `007_password_recovery.sql` — expiring single-use password reset token hashes
   with active-user and expiration indexes.
