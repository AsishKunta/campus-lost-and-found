# Campus Lost & Found — Database Architecture Audit

## Audit status

**Audited:** 2026-08-06 CDT
**Database:** PostgreSQL, schema `public`  
**Health:** Healthy; secure password recovery added through a forward migration
**Applied migrations:** 001–007, checksum-aligned with the repository

This document records the current implementation. Future recommendations are
separated near the end and are not implemented Phase 6 features.

No password hash, session token/hash, credential, private note content, or
personal record value was read into this audit report.

## Current relationship and data-flow map

```text
users
├── user_roles
├── sessions
├── password_reset_tokens
├── reports ── report_images
│   ├── report_matches (Lost ↔ Found)
│   └── notifications
├── claims
│   ├── claim_history
│   ├── claim_admin_notes
│   ├── messages
│   └── notifications
└── notifications

schema_migrations → ordered migration ledger (not product data)
```

Application flow:

```text
users/user_roles/sessions
  → Lost and Found reports
  → report_matches + match notifications
  → claims + claim_history
  → Admin review / verification / approval
  → messages + status notifications
  → return / closure timestamps and report lifecycle state
```

## Table map

### `users`

- **Purpose:** Canonical account and authentication identity.
- **Primary key:** `id` integer.
- **Important columns:** `name`, normalized `email`, bcrypt `password` hash,
  compatibility `role`, `preferred_workspace`, unique `student_id`,
  `created_at`.
- **Foreign keys:** None.
- **Referenced by:** roles, sessions, reports, claims, claim reviewers/history,
  Admin Notes, messages, and notifications.
- **Application usage:** signup/login, session hydration, ownership, workspace
  switching, trusted Student identity, and Admin attribution.
- **Lifecycle:** Inserted at signup; current code does not delete accounts.

### `user_roles`

- **Purpose:** Canonical normalized many-to-many role membership.
- **Primary key:** `(user_id, role)`.
- **Important columns:** constrained `role` (`student` or `admin`), `created_at`.
- **Foreign keys:** `user_id → users.id ON DELETE CASCADE`.
- **Referenced by:** authorization/session hydration and Admin notification fanout.
- **Application usage:** available workspaces and backend role enforcement.
- **Lifecycle:** Created with accounts or explicit development provisioning;
  duplicate membership is prevented by the composite key.

### `sessions`

- **Purpose:** Expiring, revocable server-side authentication sessions.
- **Primary key:** UUID `id`.
- **Important columns:** unique one-way `token_hash`, `expires_at`,
  `last_seen_at`, `revoked_at`, optional user-agent/IP metadata.
- **Foreign keys:** `user_id → users.id ON DELETE CASCADE`.
- **Referenced by:** No product table.
- **Application usage:** login, `/auth/me`, middleware authentication, logout.
- **Lifecycle:** Inserted on login, touched during validation, revoked on logout,
  and treated as inactive after expiration.

### `password_reset_tokens`

- **Purpose:** Expiring, single-use password recovery authorization.
- **Primary key:** UUID `id`.
- **Important columns:** unique SHA-256 `token_hash`, `expires_at`, `used_at`,
  `created_at`, and optional request IP.
- **Foreign keys:** `user_id → users.id ON DELETE CASCADE`.
- **Referenced by:** No product table.
- **Application usage:** forgot-password delivery and transactional password reset.
- **Lifecycle:** Previous unused tokens are consumed when a new request is made;
  successful reset marks one used and revokes every active user session.

### `reports`

- **Purpose:** Both Lost and Found reports.
- **Primary key:** `id` integer.
- **Important columns:** item/category/location/date/description, compatibility
  reporter snapshots (`name`, `email`, `phone`), `user_id`, compatibility
  `status` and `claim_status`, canonical `lifecycle_status`, close metadata,
  legacy primary `image_url`, and `created_at`.
- **Foreign keys:** `user_id → users.id ON DELETE SET NULL`.
- **Referenced by:** images, both sides of matches, Found/Lost claim links, and
  notifications.
- **Application usage:** Student discovery/My Reports, Admin report monitoring,
  matching, claim context, closure, return, and analytics inputs.
- **Lifecycle:** Created active; may become claimed, closed by Student, returned,
  or archived. No active delete endpoint exists.

### `report_images`

- **Purpose:** Ordered multi-image collection for reports while preserving the
  legacy `reports.image_url` primary-image field.
- **Primary key:** `id` bigint.
- **Important columns:** `image_url`, nonnegative `sort_order`, `created_at`.
- **Foreign keys:** `report_id → reports.id ON DELETE CASCADE`.
- **Referenced by:** No table.
- **Application usage:** report cards and detail galleries.
- **Lifecycle:** Inserted with a report; follows report lifetime.

### `report_matches`

- **Purpose:** Durable explainable Lost/Found candidate pairing.
- **Primary key:** `id` bigint.
- **Important columns:** unique `(lost_report_id, found_report_id)`, bounded
  `score` 0–100, JSONB `evidence`, `created_at`.
- **Foreign keys:** both report IDs reference `reports.id ON DELETE CASCADE`.
- **Referenced by:** notifications.
- **Application usage:** personalized discovery, potential matches, claim
  eligibility, and new-match notifications.
- **Lifecycle:** Upserted when either report is created; inactive report states
  are filtered rather than deleting historical matches.

### `claims`

- **Purpose:** Transactional ownership request and recovery state machine.
- **Primary key:** `id` integer.
- **Important columns:** claimant `user_id`; Found `report_id`; optional Lost
  `lost_report_id`; trusted Student/item snapshots; verification/evidence;
  `status`; reviewer/rejection fields; expiration; verification version;
  approval/return/closure/archive timestamps; manual-entry context.
- **Foreign keys:** report links and claimant/reviewer references use
  `ON DELETE SET NULL` to preserve the claim record.
- **Referenced by:** history, Admin Notes, messages, and notifications.
- **Application usage:** submission, three-per-Lost-report policy, review,
  re-verification, approval/rejection, return, closure, and My Claims.
- **Lifecycle:** State transitions are enforced by backend transactions and a
  database status check. Claims are closed/archived, not deleted.

### `claim_history`

- **Purpose:** Append-only timeline/audit events for claim transitions.
- **Primary key:** `id` bigint.
- **Important columns:** `event_type`, from/to status, reason, JSONB metadata,
  `created_at`.
- **Foreign keys:** `claim_id → claims.id ON DELETE CASCADE`; optional
  `actor_id → users.id ON DELETE SET NULL`.
- **Referenced by:** No table.
- **Application usage:** shared Student/Admin lifecycle timeline.
- **Lifecycle:** Appended inside the same workflow transactions as state changes.

### `claim_admin_notes`

- **Purpose:** Private internal verification notes.
- **Primary key:** `id` bigint.
- **Important columns:** nonblank `note`, `created_at`.
- **Foreign keys:** `claim_id → claims.id ON DELETE CASCADE` and
  `admin_id → users.id ON DELETE RESTRICT`.
- **Referenced by:** No table.
- **Application usage:** Admin-only claim review details.
- **Lifecycle:** Append-only; preserved with claim history.

### `messages`

- **Purpose:** Claim-scoped Student/Admin conversation messages.
- **Primary key:** UUID `id`.
- **Important columns:** claim, canonical sender user, compatibility
  sender/recipient role fields, compatibility sender identifier, message,
  `created_at`.
- **Foreign keys:** `claim_id → claims.id ON DELETE CASCADE` and optional
  `sender_user_id → users.id ON DELETE SET NULL`.
- **Referenced by:** No table.
- **Application usage:** authorized claim conversations and conversation lists.
- **Lifecycle:** Append-only; no deletion endpoint exists.

### `notifications`

- **Purpose:** Durable in-app user notifications.
- **Primary key:** `id` bigint.
- **Important columns:** type/title/message, optional report/claim/match
  context, `read_at`, and `created_at`.
- **Foreign keys:** user/report/claim/match references use `ON DELETE CASCADE`.
- **Referenced by:** No table.
- **Application usage:** matches, submissions, verification requests,
  approvals/rejections, expiration, return, and read state.
- **Lifecycle:** Inserted transactionally with workflow changes and marked read;
  match notifications are deduplicated by a partial unique index.

### `schema_migrations`

- **Purpose:** Immutable migration ledger.
- **Primary key:** three-character `version`.
- **Important columns:** unique filename, SHA-256 checksum, application time,
  and nonnegative execution duration.
- **Foreign keys / referenced by:** None.
- **Application usage:** advisory-locked migration execution and startup
  readiness checks.
- **Lifecycle:** One row is appended after each migration commits.

## Canonical identity and role architecture

- `users.id` is the canonical identity key.
- `user_roles` is the canonical role-membership model and already supports one
  account holding Student, Admin, or both roles.
- `users.preferred_workspace` selects the active authorized workspace and is
  accepted only when membership exists; the backend checks this relationship.
- `users.role` remains an actively read compatibility field. It is not the sole
  authorization source and should not be removed during Phase 6.
- Development email domains influence role only during non-production signup.
  Stored roles and backend middleware authorize subsequent requests.
- Reporter and claimant names/emails/student IDs stored on reports/claims are
  deliberate historical snapshots; ownership uses numeric user IDs.

## Constraints and referential integrity

Current protections include:

- Unique account emails and Student IDs.
- Normalized role membership uniqueness and controlled role/workspace values.
- Expiring sessions with unique token hashes.
- Controlled report/claim/message role states.
- Unique Lost/Found match pairs and bounded match scores.
- Unique active Student claim per Found Report.
- At most one currently `approved` claim per Found Report.
- Nonblank ownership verification and positive verification versions.
- Complete manual-claim context when `manual_entry = true`.
- Owned resources use backend ownership predicates to prevent IDOR.

Historical records deliberately favor preservation: deleting a user sets many
business references to null, while account roles/sessions are account-owned and
cascade. Child media/match/notification data cascades with its parent. The
application currently exposes no report/claim/account delete workflow.

## Status and auditability

Canonical claim statuses are lowercase:

`pending`, `under_review`, `action_required`, `approved`, `rejected`,
`automatically_rejected`, `cancelled`, `expired`, `returned`, `closed`.

Canonical report lifecycle statuses are:

`active`, `claimed`, `closed_by_student`, `returned`, `archived`.

`reports.status` and `reports.claim_status` are compatibility/presentation
projections and can overlap with `lifecycle_status`. They remain actively read
and written, so removing or renaming them would create unnecessary regression
risk. Claim audit reconstruction uses `claim_history` plus the explicit
reviewed/resubmitted/approved/returned/closed/archived timestamps.

## Index assessment

Current high-value indexes cover:

- session ownership and active expiration;
- report owner/lifecycle and matching category/category/date;
- claim ownership, report links, status, expiration, review queues, active
  Lost-report counts, duplicate active claims, and single approval;
- ordered claim history/Admin Notes/messages;
- unread notifications and match-notification deduplication;
- report image ordering and pair uniqueness;
- role-to-user lookups.

The current dataset is small. Future scale may justify indexes beginning with
`report_matches(found_report_id, score)`, all-notification ordering by
`(user_id, created_at DESC)`, and selected unindexed foreign-key columns. Add
them only with production-sized query plans; do not add vector/full-text search
indexes until Phase 6 search requirements and measurements exist.

## Live integrity evidence

The audited local database contained 9 users, 10 role assignments, 12 reports,
4 matches, 6 claims, 24 history events, 3 Admin Notes, 29 notifications, no
messages, and 11 session rows. Aggregate checks found:

- no users without roles or invalid preferred workspace membership;
- no claimantless claims and only two preserved legacy ownerless reports;
- no invalid Lost/Found match direction or claim/report type relationship;
- no case-insensitive duplicate email group;
- no multiple terminal ownership claims for one Found Report;
- no missing current lifecycle timestamps or required claim history;
- no missing item/category/date/description data in current reports/claims;
- no below-threshold or self-match records.

The one `users.role`/preferred-workspace mismatch belongs to the intentional
dual-role compatibility model and is not an authorization defect.

## Migration health

- Six ordered migrations are present and applied.
- Repository SHA-256 checksums exactly match the live ledger.
- Advisory locking, per-migration transactions, rollback, and startup checks
  are implemented.
- A fresh temporary database successfully applied 001–006 and reported all six
  current; the configured existing database also reported all six current.
- Applied files were not edited during this audit.

The role/category/message-role checks introduced with legacy compatibility are
`NOT VALID`: PostgreSQL enforces them for new/changed rows, but their historic
rows were not marked validated. Current rows satisfy them. Validation can be a
small future hardening migration, but it is not required for current safety.

## Legacy and compatibility classification

| Structure | Classification | Reason |
| --- | --- | --- |
| `users.role` beside `user_roles` | KEEP FOR COMPATIBILITY | Still read/written; normalized memberships are authoritative |
| `reports.status` / `claim_status` beside lifecycle status | KEEP FOR COMPATIBILITY | Active UI/API projections; canonical lifecycle remains clear |
| `reports.name/email/phone` | KEEP FOR COMPATIBILITY | Reporter snapshot and existing API output |
| `claims.student_id/student_email/item_*` | STILL ACTIVELY USED | Trusted historical/manual-claim snapshots |
| `reports.image_url` beside `report_images` | KEEP FOR COMPATIBILITY | Primary-image fallback and existing clients |
| `messages.sender_type/sender_id` | DEPRECATE LATER | Canonical sender user/role exists, but current queries/output still use them |
| development bypass identity support | DEPRECATE LATER | Explicitly disabled in production; useful local compatibility |
| `backend/data/db.json` | DEPRECATE LATER | Not referenced by the Express/PostgreSQL runtime |

No database table or column is safe to remove now without a separate usage and
compatibility migration.

## Findings by severity

### CRITICAL

None found.

### RECOMMENDED

- Keep this database map current and keep migrations 001–007 immutable.
- Remove sensitive request-body/insert-value logging from report creation before
  production observability work; this is an application logging concern, not a
  schema migration.
- Measure production-like query plans before Phase 6 and add only demonstrated
  indexes, especially for Found-side match lookup and full notification lists.

### OPTIONAL

- Validate the four legacy `NOT VALID` checks in a future forward migration.
- Add a case-insensitive unique email index as defense in depth if future
  identity imports can bypass the existing normalization service.
- Standardize nullable legacy timestamp columns in a carefully backfilled future
  migration.
- Add database-level cross-table Lost/Found relationship enforcement only if a
  maintainable trigger strategy is justified; current transactional checks and
  foreign keys are working.

### DO NOT CHANGE

- Do not split Student and Admin into separate tables.
- Do not remove compatibility role/status/snapshot/image/message fields now.
- Do not change claim status terminology or lifecycle transitions.
- Do not replace preserved `SET NULL` history relationships with destructive
  cascades.
- Do not add speculative vector/search infrastructure during this preparation.
- Do not edit any applied migration.

## Phase 6 readiness

- **Production authorization:** Ready structurally. Canonical users, normalized
  roles, preferred workspace, hashed sessions, and numeric ownership exist.
  University SSO will need external identity/account-state fields later.
- **Email notifications:** Partially ready. Durable notification events and
  unique emails exist; delivery attempts, provider identifiers, retry state,
  consent/preferences, and delivery timestamps will require forward schema.
- **Smart search:** Ready for initial relational search. Report category,
  location, date, description, and matching evidence exist. Measure before
  selecting trigram/full-text/vector indexes.
- **Analytics:** Ready for basic recovery volume/outcome/time metrics from
  reports, claims, history, and timestamps. More reliable operational analytics
  may later need normalized category/location vocabularies and explicit event
  semantics.

**Conclusion:** The database is understandable and internally consistent.
Migration 007 was added specifically for secure password recovery; no unrelated
corrective or speculative schema change was introduced.
