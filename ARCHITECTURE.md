# Campus Lost & Found — Architecture

## Architectural scope

The application is a small modular monolith with a static browser client,
Express API, and PostgreSQL database. `dashboard.html` is the canonical
role-aware application shell; legacy Admin and Profile documents are now
compatibility redirects rather than separate runtime interfaces.

Workspace authorization uses two related facts: normalized role assignments
define which workspaces an account may select, while `preferredWorkspace`
defines which role is active for the current request. Controllers and role
middleware scope data and actions to that active workspace.

This document describes both the current architecture and the recommended
target direction.

---

## Context diagram

```text
┌─────────────────────┐
│ Student / Reporter  │
└──────────┬──────────┘
           │ browser
           ▼
┌─────────────────────┐
│ Static Web Client   │
│ HTML / CSS / JS     │
└──────────┬──────────┘
           │ JSON / multipart HTTP
           ▼
┌─────────────────────┐
│ Express API         │
│ routes/controllers  │
└──────┬────────┬─────┘
       │        │
       │        └──────────────┐
       ▼                       ▼
┌──────────────┐       ┌────────────────┐
│ PostgreSQL   │       │ Local uploads  │
│ users/reports│       │ backend/uploads│
│ claims/messages      └────────────────┘
└──────────────┘

┌─────────────────────┐
│ Administrator       │
└──────────┬──────────┘
           └── uses the same client/API with active-workspace authorization
```

---

## Runtime topology

### Frontend

The frontend is served as static files. Locally:

```bash
python3 -m http.server 4173
```

The Vercel configuration maps `/` to `/dashboard.html`.

### Backend

The backend runs separately:

```bash
cd backend
npm start
```

Default address:

```text
http://localhost:3001
```

### Session and transport security boundary

```text
Credentials → bcrypt verification → new 256-bit random token
  → SHA-256 token hash stored in PostgreSQL sessions
  → raw token sent only in HTTP-only cookie
  → authenticate middleware rejects revoked/expired rows on every request
  → logout revokes the hash and clears the matching cookie
```

Each successful login issues a fresh identifier, which provides login-time
rotation. Role and preferred-workspace authorization is loaded from PostgreSQL
on every request, so a stale cookie cannot preserve removed privileges.
Password changes are not currently supported; a future password-change flow
must revoke all existing sessions.

Cookie defaults are environment-aware:

| Setting | Development | Production |
| --- | --- | --- |
| Name | `campus_session` | `__Host-campus_session` |
| HttpOnly | Yes | Yes |
| Secure | No | Yes |
| SameSite | Lax | None (Vercel → Render cross-site) |
| Path | `/` | `/` |
| Domain | Unset | Unset |
| Lifetime | Explicit `Max-Age` + `Expires` | Explicit `Max-Age` + `Expires` |

Security headers run before CORS and routes: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a restrictive
camera/geolocation/microphone `Permissions-Policy`. Auth responses use
`Cache-Control: no-store`.

Production CORS accepts credentialed requests only from explicit
`FRONTEND_ORIGINS`; missing configuration permits no browser origin and `*` is
rejected. Development retains the documented loopback allowlist. Production's
Vercel-to-Render topology requires `SameSite=None`; `Secure`, the host-only
`__Host-` prefix, JSON request bodies, and the exact credentialed origin
allowlist remain the transport and CSRF boundary.

Failed login throttling is keyed by a SHA-256 digest of client IP and normalized
email, counts only invalid credentials, clears after successful login, and
defaults to 10 attempts per 15 minutes. It is process-local; multi-instance
production requires a shared limiter or edge gateway.

### Remember Me lifetime selection

```text
POST /auth/login { email, password, rememberMe: boolean }
  → validate boolean (missing remains false/backward compatible)
  → verify credentials and throttle policy
  → server selects 8-hour normal TTL or 30-day remembered TTL
  → createSession writes the computed sessions.expires_at
  → cookie helper derives matching Max-Age and Expires
```

The browser cannot select an expiry timestamp or arbitrary number of days.
Remember Me stores no credential and introduces no token type, JWT, localStorage
authentication, schema field, or alternate revocation path.

### AI description assistant boundary

```text
Unified Lost/Found description textarea
  → authenticated POST /description-assistant/improve
  → per-user fixed-window limiter + 5,000-character validation
  → descriptionAssistantService
  → configured OpenAI Responses adapter (description text only; store=false)
  → plain-text/output/factual-risk validation
  → reversible Original/Suggested preview
  → user explicitly Use / Edit / Keep Original
  → ordinary POST /reports
  → unchanged reports.description + matching pipeline
```

The controller knows only the provider-independent service. The provider has no
tools, database, session, role, report, message, claim, Admin Note, or ownership
evidence access. Instructions treat the description as untrusted data, forbid
new facts, preserve uncertainty/details, and request plain text only. Output is
bounded and rejects empty, structured, newly introduced color/numeric details,
or removed uncertainty. These checks reduce risk but cannot prove semantic
truth; explicit user review and no automatic save are the final safety boundary.

Configuration defaults to disabled. `AI_DESCRIPTION_PROVIDER=openai` requires
server-only `OPENAI_API_KEY`; model, endpoint, length, and limiter values are
environment-controlled. Provider errors are metadata-only logs and safe 503
responses. No database or matcher change was introduced.

### Smart Search boundary

```text
Existing dashboard search input
  → authenticated GET /reports/search?q=...
  → active-workspace candidate SQL
  → reportSearchService.parseSearchQuery
  → normalize + controlled synonyms + bounded typo comparison
  → date/type/category/color/brand signal extraction
  → weighted per-report scoring and deterministic sort
  → privacy-safe report DTO + relevance evidence
  → existing report cards and detail modal
```

Student candidate SQL includes active Found Reports and reports owned by the
authenticated user. Admin candidate SQL includes all retained reports,
including closed, returned, and archived records. The controller blanks legacy
contact fields from Student search DTOs. Claim evidence, Admin Notes, messages,
and session data are neither selected as signals nor returned.

Search relevance is not the persisted automatic Match Score and not a
probability. The raw score combines item name (34), description overlap (22),
location (20), inferred category (16), explicit date range (12), color (8),
brand/identifying phrase (8), report intent (7), and active lifecycle priority
(3). Only signals present in the query contribute to optional denominator
weights; field evidence records actual contributions. Scores map to Very Strong
(90–100), Strong (75–89), Possible (50–74), and Weak (below 50).

No schema/index change was made. The authorized candidate query is capped at
5,000 records and ranking is process-local. A 5,000-row deterministic fixture
ranks in approximately 1.1 seconds on the current development machine. Add
pagination or measured PostgreSQL text indexes before increasing that bound.

### Database

The backend requires `DATABASE_URL`. Schema changes are applied explicitly with
`npm run migrate`. On startup the API verifies connectivity and confirms that
every local migration is recorded with the expected checksum. It refuses to
listen when migrations are pending or an applied migration was changed.

### Migration lifecycle

```text
backend/migrations/NNN_name.sql
  ↓ npm run migrate
advisory lock
  ↓
schema_migrations checksum validation
  ↓
BEGIN → apply one migration → record ledger row → COMMIT
  ↓
next pending migration
```

Each failed migration is rolled back. Applied migration files are immutable.

The complete current table/column/relationship/constraint/index map and the
2026-08-02 Phase 6 readiness audit are maintained in
[`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md). It is the authoritative
database-focused companion to this system-level architecture document.

### Safe runtime logging

`backend/utils/safeLogger.js` is the small runtime logging boundary. Operational
events may include operation names, numeric record/user IDs, roles, ports, and
counts. Error events include only bounded name/code/constraint/severity
metadata. Controllers must not log request bodies, SQL parameter arrays,
credentials, contact information, ownership verification, Admin Notes, message
contents, database detail/hint fields, or stacks.

## Authentication and authorization boundary

```text
Sign Up
  → validate + normalize email/password
  → bcrypt password hash
  → users + user_roles

Sign In
  → bcrypt verification
  → random session token to HTTP-only cookie
  → SHA-256 token hash in sessions

Protected request
  → cookie token hash lookup
  → active, unrevoked, unexpired session
  → canonical users.id + persisted user_roles + preferred_workspace
  → requireRole / ownership predicate
  → controller action

Logout
  → hash presented cookie token
  → revoke matching server session
  → clear cookie
```

The `@student.com` and `@admin.com` rules assign an initial role only during
non-production registration. Every later authorization decision uses the
persisted session user, normalized database roles, active assigned workspace,
and resource ownership. Browser storage, hashes, query/body values, and custom
role headers are not authorization sources.

### Protected-route authorization matrix

Legend: **Own** means a Student predicate uses authenticated `users.id`.

| Method | Route | Auth | Student | Admin | Ownership / enforcement |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/signup` | No | Registration | Registration | Development domain assigns initial persisted role |
| POST | `/auth/login` | No | Yes | Yes | Bcrypt credentials; creates server session |
| POST | `/auth/logout` | Cookie optional | Yes | Yes | Revokes only the presented hashed session token |
| GET | `/auth/development-status` | No | Yes | Yes | Non-sensitive mode status only |
| GET | `/auth/me` | Yes | Yes | Yes | Current session user only |
| GET | `/auth/profile/:email` | Yes | Own | Own | Requested normalized email must equal session email |
| PATCH | `/auth/workspace` | Yes | Assigned only | Assigned only | Database `EXISTS user_roles` membership check |
| GET | `/reports` | Yes | Own Lost | All | Active workspace derived with `hasRole` |
| GET | `/reports/discover` | Yes | Yes | No | Student role; Found public projection, owned match ranking |
| GET | `/reports/mine` | Yes | Own | No | Student role + `user_id` |
| GET | `/reports/student-lost` | Yes | No | Yes | Admin middleware |
| GET | `/reports/:id/matches` | Yes | Own | No | Student role + owned Lost Report |
| POST | `/reports/:id/close` | Yes | Own | No | Student role + owner/category/state lock |
| GET | `/reports/:id` | Yes | Own Lost | All | Controller ownership/Admin branch |
| POST | `/reports` | Yes | Yes | Yes | Active persisted Student or Admin workspace |
| PATCH | `/reports/:id` | Yes | No | Yes | Controller `hasRole(admin)` check |
| GET | `/claims` | Yes | Own | All | Controller scopes Student by `user_id` |
| POST | `/claims` | Yes | Yes | No | Student middleware; claimant identity from session |
| POST | `/claims/:id/cancel` | Yes | Own | No | Student middleware + owner/state predicate |
| PATCH | `/claims/:id/verification` | Yes | Own | No | Student middleware + owner row lock |
| POST | `/claims/:id/review` | Yes | No | Yes | Admin middleware |
| GET | `/claims/:id/related` | Yes | No | Yes | Admin middleware |
| POST | `/claims/:id/decision` | Yes | No | Yes | Admin middleware + transaction/row lock |
| POST | `/claims/:id/request-verification` | Yes | No | Yes | Admin middleware |
| POST | `/claims/:id/return` | Yes | No | Yes | Admin middleware + valid transition |
| POST | `/claims/:id/close` | Yes | No | Yes | Admin middleware + valid transition |
| POST | `/claims/:id/admin-notes` | Yes | No | Yes | Admin middleware; notes excluded from Student DTO |
| GET | `/messages/conversations` | Yes | Own | All | Student claim ownership; Admin scope from server role |
| GET | `/messages/:claim_id` | Yes | Own | All | Claim-owner predicate or server-derived Admin |
| POST | `/messages` | Yes | Own claim | All claims | Claim-owner predicate or server-derived Admin |
| GET | `/notifications` | Yes | Own | Own or all | `scope=all` accepted only for active Admin |
| PATCH | `/notifications/:id/read` | Yes | Own | Own | Notification ID and session user ID predicate |

No user-list, report-delete, claim-delete, or standalone report-archive API is
currently exposed.

---

## Component relationships

```text
dashboard.html
 ├── common.js
 ├── userContext.js
 ├── dashboard.js
 ├── report.js
 ├── claim.js
 ├── student-messages.js
 ├── admin-dashboard.js
 ├── admin-claims.js
 ├── admin-messages.js
 └── router.js

report.js
 └── POST /reports
      └── reportController.createReport
           ├── PostgreSQL INSERT
           ├── PostgreSQL candidate SELECT
           └── reportMatchingService.findPotentialMatches

claim.js
 └── POST /claims
      └── claimController.createClaim

admin-dashboard.js / admin-claims.js
 └── POST /claims/:id/decision
      └── claimController.decideClaim

dashboard.js → GET /reports/discover
  └── Claim This Item → claim.js
      ├── trusted Found context → POST /claims
      └── PATCH /claims/:id/verification

router.js → New Claim → claim.js (same #page-claim section)
  └── validated manual item context → POST /claims

report-workspaces.js
  ├── GET /reports/mine → Student My Reports
  ├── GET /reports/student-lost → Admin Student Lost Reports
  └── GET /claims → Student My Claims

report.js
  └── POST /reports
      ├── one Report Item form with required Lost/Found selector
      └── authenticated Student or Admin workspace → Lost or Found Report
          (up to five report_images)
          ├── Lost → active Found matching → Potential Matches
          └── Found → candidate inventory → Dashboard

admin-claims.js
  ├── POST /claims/:id/review
  ├── POST /claims/:id/request-verification
  ├── POST /claims/:id/decision
  ├── POST /claims/:id/return
  └── POST /claims/:id/close

student-messages.js / admin-messages.js
 ├── GET /messages/conversations
 ├── GET /messages/:claim_id
 └── POST /messages

### Transactional recovery lifecycle

`claimLifecycleService.js` is the canonical transition map. Controllers lock
claims and reports inside PostgreSQL transactions, validate the transition,
append `claim_history`, update report lifecycle state, and persist required
notifications before committing.

```text
pending → under_review → action_required → pending
        ↘ approved → returned → closed/archived
        ↘ rejected
```

Student re-verification mutates the original claim and increments
`verification_version`. A partial unique index plus record locking prevents
multiple approved owners for one Found Report.

Dashboard discovery is intentionally distinct from report ownership. Found
Reports are public-to-authenticated-students discovery DTOs with private
contact fields removed. Lost Reports use separate owner/admin endpoints.
Personalization is deterministic ordering—matched items first by Match Score,
then remaining Found Reports by recency—so discovery never hides inventory.
```

---

## Frontend page model

### Primary application

`dashboard.html` contains multiple `.spa-page` sections. Navigation is hash
based:

```text
#dashboard
#report
#claim
#new-claim
#my-reports
#my-claims
#conversations
#claim-requests
#student-lost-reports
#profile
```

`router.js` controls which section is active and dispatches role-aware page
initializers.

### Standalone compatibility pages

Legacy feature URLs remain only as immediate compatibility redirects to the
corresponding `dashboard.html#...` route. They are not runtime application
surfaces. Active navigation must use `navigate()` and canonical hashes. The
router normalizes `#messages` to `#conversations`, stores route parameters in
History state, and restores them on Back/Forward and refresh.

### Global dependency model

The frontend is not ES-module based. Functions and constants are shared through
the global window scope and script order.

Examples:

- `BASE_URL` from `common.js`
- `getCurrentUser` from `userContext.js`
- `navigate` and `registerPage` from `router.js`
- Page-specific initialization functions exposed on `window`

This makes script order significant and increases collision risk.

---

## Frontend modules

### `common.js`

Responsibility:

- API base URL
- Server-session login guard
- Credentialed API requests and server logout
- Role switching
- Role dashboard redirect
- Profile dropdown
- Toast notifications

Current concern: authentication is server-trusted, but browser role selection
still controls presentation, while backend role and ownership authorization is
the security boundary.

### `userContext.js`

Responsibility:

- Normalize the current prototype identity.

Display identity is cached from `/auth/me`. Backend controllers never trust
this cache; authenticated identity comes from the server session.

### `router.js`

Responsibility:

- Sidebar definitions
- Page title mapping
- Section activation
- History/hash management
- Role guards in the browser
- Student/admin initializer dispatch

Browser guards are UX behavior, not authorization.

### `dashboard.js`

Responsibility:

- Load and cache reports
- Search/filter
- Statistics
- Report cards and detail modal
- Claim entry

### `admin-dashboard.js`

Responsibility:

- Admin report list
- Claims joined into report presentation
- Approve/reject actions
- Admin filters and statistics

It duplicates substantial dashboard behavior.

### `report.js`

Responsibility:

- Report form
- Image preview
- FormData request
- Submission state
- Match-result rendering
- Match detail disclosure
- Claim handoff
- Dismissal and dashboard return

This is the most polished current frontend module.

### `claim.js`

Responsibility:

- Optional report ID handoff
- Claim form
- Evidence image preview
- Claim request
- Submission states

### Messaging modules

`student-messages.js` and `admin-messages.js` manage their respective
conversation interfaces. `admin-claims.js` includes another embedded messaging
implementation. `my-claims.js` is a legacy direct-Supabase path.

### `login.js`

Responsibility:

- Login/signup mode switching
- Frontend Gmail-only check
- API calls
- Send credentialed signup/login requests
- Cache the public `/auth/me` user for display after server-confirmed login

The Gmail-only rule is inconsistent with a campus identity product and should
be revisited when real identity is introduced.

### `profile.js`

Responsibility:

- Load profile by email
- Filter all reports by matching email
- Render profile statistics and submissions
- Nonpersistent local profile-name edit

---

## Backend request flow

```text
HTTP request
  ↓
Express middleware
  ├── credential-enabled origin allowlist
  ├── JSON body parsing
  ├── authentication middleware where required
  └── Multer for report/claim uploads
  ↓
Route module
  ↓
Controller
  ├── validation
  ├── SQL
  ├── business logic
  └── response mapping
  ↓
PostgreSQL pool
```

There is no centralized:

- Error middleware
- Validation middleware
- Authorization middleware
- Request ID/logging middleware
- Service layer apart from matching
- Repository/data-access layer

---

## Backend services

### Report matching service

`backend/services/reportMatchingService.js` is a pure, testable domain service.

Exports:

- `normalizeReportType`
- `tokenize`
- `wordOverlap`
- `dateDifferenceInDays`
- `scoreCandidate`
- `findPotentialMatches`

It has no database or HTTP dependency.

### Matching workflow direction

```text
POST Found Report
  → persist active Found inventory
  → matches: []
  → success + Dashboard

POST Lost Report
  → persist Lost Report
  → SELECT existing reports WHERE category='Found'
                              AND lifecycle_status='active'
  → unchanged reportMatchingService scoring
  → persist report_matches (Lost ID, Found ID)
  → notify Lost Report owner
  → Potential Matches UI (including zero-match state)
```

`reports.lifecycle_status` is authoritative for recovery availability. No
compatibility `status` value or invented inactive state participates in the
candidate query.

### Authentication service

`backend/services/authService.js` validates registration/login input, hashes
passwords, creates opaque session tokens, stores only their SHA-256 hashes,
validates live sessions, and revokes sessions.

```text
login credentials
  → bcrypt verification
  → 256-bit random token
  → SHA-256 token hash in sessions
  → HTTP-only SameSite cookie containing raw token
  → authenticate middleware
  → req.user derived from users + sessions
```

Development cookies omit `Secure` for local HTTP. Production cookies enable
`Secure`. Sessions default to eight hours and expire in both the database query
and cookie.

### Report search service

`backend/services/reportSearchService.js` is a pure, testable retrieval service.
It shares date-difference semantics with the matcher but owns separate query
parsing, synonym, typo, weighting, normalization, label, and evidence rules.
This separation prevents interactive retrieval from mutating or duplicating
the persisted Lost/Found matching lifecycle.

### Recommended future services

- `authService`: session establishment and password/account rules
- `reportService`: report creation, ownership, public/private DTOs
- `claimService`: submission and transactional adjudication
- `messageService`: authorized conversations and read state
- `notificationService`: email/event delivery
- `auditService`: immutable workflow events

---

## Report creation data flow

```text
User completes report form
  ↓
report.js constructs FormData
  ↓
POST /reports
  ↓
Multer optionally writes up to five images
  ↓
reportController validates report type/category
  ↓
BEGIN → INSERT reports + report_images
  ↓
SELECT all reports excluding inserted ID
  ↓
Map rows to report DTOs
  ↓
findPotentialMatches(newReport, allReports)
  ↓
persist report_matches + notifications → COMMIT
  ↓
Return { report, matches }
  ↓
report.js renders success or empty state
  ↓
User views, dismisses, or starts claim
```

---

## Match scoring data flow

```text
candidate
  ↓ eligibility
opposite type? different ID?
  ↓
item category equality ───────────── +25
item-name token overlap ──────────── +25
location token overlap ───────────── +20
description token overlap ────────── +15
same date ────────────────────────── +15
within 3 days ────────────────────── +10
  ↓
score >= 30?
  ↓
candidate + matchScore + matchEvidence
  ↓
sort descending
```

Scores are evidence ranks, not probabilities.

---

## Claim adjudication data flow

Current:

```text
POST /claims/:id/decision
  ↓
SELECT claim
  ↓
if approving and linked:
  SELECT report.claim_status
  ↓
UPDATE claim
  ↓
if approving and linked:
  UPDATE report.claim_status
```

Risk: these are separate statements without a transaction or row lock.

Target:

```text
BEGIN
  SELECT claim FOR UPDATE
  SELECT report FOR UPDATE
  validate report is claimable
  UPDATE selected claim
  UPDATE/close competing claims
  UPDATE report lifecycle state
  INSERT audit event
COMMIT
```

Add a unique partial constraint preventing multiple approved claims for one
report.

---

## Messaging data flow

### Conversation list

The controller joins messages to claims, orders newest first, groups by claim in
application memory, and returns summary objects.

### Conversation history

Messages are selected by `claim_id` and ordered oldest first.

### Message creation

The server derives sender identity and role from the authenticated session,
verifies the claim exists, and inserts the message. It does not yet verify that
the authenticated user participates in the claim.

Target flow:

```text
authenticated principal
  ↓
authorize claim membership/admin role
  ↓
derive sender identity and role on server
  ↓
insert message
  ↓
publish event / update unread state
```

---

## Database interaction model

Controllers use parameterized SQL through one shared `pg.Pool`. This protects
the existing queries from conventional SQL injection.

Current database shortcomings:

- Authorization policies use normalized roles and ownership relationships
- Some controlled-state checks remain `NOT VALID` for legacy-row compatibility
- Inconsistent status representations
- Nullable ownership relationships
- Historical reports are not backfilled to users
- Duplicate role/status fields
- No audit/event table

---

## Current entity relationship model

```text
┌──────────────┐
│ users        │
│ id PK        │
│ email UNIQUE │
└──────┬───────┘
       │ optional user_id
       ▼
┌──────────────┐       optional report_id       ┌──────────────┐
│ claims       │────────────────────────────────▶│ reports      │
│ id PK        │                                 │ id PK        │
│ status       │                                 │ report type  │
└──────┬───────┘                                 │ item category│
       │ 1                                       └──────────────┘
       │
       │ many
       ▼
┌──────────────┐
│ messages     │
│ id UUID PK   │
│ claim_id FK  │
└──────────────┘
```

The arrow between claims and reports is logically many claims to one report,
although `report_id` may be null.

### Identity and authorization schema foundation

Phase 1 adds, without yet changing runtime identity behavior:

```text
users 1 ───── 0..* sessions
users 1 ───── 0..* reports
users 1 ───── 0..* claims
users 1 ───── 0..* messages (sender_user_id)
reports 1 ─── 0..* claims
claims 1 ──── 0..* messages
```

- `users.role` defaults to `student` and allows `student` or `admin`.
- `sessions` stores a session token hash, expiry, revocation, activity, and
  optional client metadata; raw tokens exist only in HTTP-only cookies.
- Ownership foreign keys are nullable to preserve historical records.
- One partial unique index allows at most one approved claim per report.
- Query indexes support sessions, ownership, matching, claim review, and
  ordered message histories.

---

## Folder responsibilities

| Path | Responsibility |
| --- | --- |
| `/dashboard.html` | Main product shell |
| Legacy `/*.html` feature URLs | Compatibility redirects into the shared shell |
| `/css` | Shared and modal styles |
| `/js` | Browser behavior and API calls |
| `/assets` | Static images |
| `/backend/routes` | HTTP route declarations |
| `/backend/migrations` | Ordered, immutable PostgreSQL schema migrations |
| `/backend/scripts/migrate.js` | Migration execution, status, checksum, locking, and readiness |
| `/backend/controllers` | Request handling and SQL |
| `/backend/services` | Pure domain logic |
| `/backend/test` | Node tests |
| `/backend/data` | Unused legacy JSON |
| `/backend/uploads` | Generated local upload storage |

---

## Architectural invariants to preserve

1. Matching has one implementation on the backend.
2. Only complementary report types are match candidates.
3. A report cannot match itself.
4. Match Score is not presented as probability.
5. Every score contribution is explainable.
6. Report Type and Item Category remain distinct concepts.
7. Matching domain functions remain pure and testable.
8. New work must preserve the immediate post-submission match experience.

---

## Future architecture recommendations

### Near term: modular monolith

Keep Express and PostgreSQL. Introduce clean layers without a broad rewrite:

```text
routes
  ↓
middleware
  ↓
controllers
  ↓
application services
  ↓
repositories
  ↓
PostgreSQL
```

### Configuration

- Use environment-specific frontend API configuration.
- Add a backend configuration module.
- Validate required environment variables on startup.
- Add health and readiness endpoints.

### Identity

- Phase 3 must introduce a normalized user-to-role relationship so one account
  can hold Student and Admin roles simultaneously.
- Preserve the constrained `users.role` column temporarily as a migration
  compatibility bridge, not as the long-term multi-role source of truth.
- Store and validate each user's preferred default workspace against their
  assigned roles.
- Preserve HTTP-only credential cookies and hashed server sessions.
- Use the existing authentication middleware for protected routes.
- Add ownership/role authorization policies. Workspace selection is UI state;
  backend policies always authorize from the server session and database roles.

### Persistence

- Continue adding immutable ordered SQL migrations.
- Validate compatibility checks after historical data is normalized.
- Add new indexes only for measured query patterns.
- Add transactions for workflow changes.
- Add an audit-event table.
- Model canonical claim closure/rejection reasons, private administrator notes,
  match-notification deduplication, and report closure without deleting history.

### Phase 3 workflow invariants

- Matching is event-driven on both Lost- and Found-report creation and ignores
  returned, closed, and archived records.
- Ranked evidence includes item name, category, building, date, and description
  keywords; only the highest-scoring candidates are surfaced.
- A Lost report has no more than three active claims. Closed claims release
  capacity.
- Student claim cancellation is allowed only before administrator review.
- Student report closure is non-destructive, cancels pending claims, and stops
  matching.
- Claims expire after a configurable 60-day interval and generate a student
  notification.
- Approval atomically locks and updates the claim/report set. Related claims
  are suggested as pre-selected closures, but only administrator-confirmed
  selections close.
- Manual and automatic rejection are distinct recorded outcomes.
- Administrator notes are private claim-history data and are excluded from all
  student/public response models.

### Phase 3 as-built architecture

```text
HTTP-only session
  → authenticate
  → normalized user_roles
  → requireRole + ownership-scoped SQL
  → report/claim/message/notification controller
  → transactional workflow operations
  → PostgreSQL history + notifications
```

Migration `003_authorized_recovery_workflow.sql` adds `user_roles`,
`report_matches`, `notifications`, `claim_admin_notes`, and `claim_history`,
plus preferred workspace, lifecycle, expiration, review, and rejection fields.
Report creation persists ranked Lost/Found pairs and conflict-safe notification
events. Claim decisions and Lost Report closure use explicit transactions and
row locks. A startup-and-hourly expiration sweep closes overdue pending claims,
records history, and creates notifications.

### Temporary local authentication bypass

`getAuthConfig` enables bypass only when `DEV_AUTH_BYPASS=true` and
`NODE_ENV !== 'production'`. Without a valid cookie, authentication middleware
loads or creates `development-user@campus.local`, assigns Student and Admin in
`user_roles`, and attaches that database identity to the request. Foreign keys,
ownership, role middleware, and workspace switching remain active. Normal
session lookup remains first and is unchanged.

### CORS boundary

`backend/config/cors.js` owns the explicit allowlist, credentials, methods, and
headers. The server registers `OPTIONS` handling and CORS before parsing,
authentication, uploads, and routes. Local ports 4173 and 5500 support both
`localhost` and `127.0.0.1`.

### Frontend

Do not select a framework solely for resume appeal. First:

- Create a shared API client.
- Standardize DTOs.
- Keep all application data access behind the authorized Express API.
- Consolidate duplicate pages.
- Establish a component/style system.
- Add browser tests.

If the frontend is later migrated to a framework, do it as a tested migration
with one canonical route at a time.

### Storage

- Replace instance filesystem storage with managed object storage.
- Validate MIME type, decoded file type, and size.
- Generate thumbnails.
- Store object metadata and delete unused objects.

### Matching

- Pre-filter in SQL.
- Normalize campus locations.
- Extract structured attributes.
- Persist match decisions.
- Build a labeled evaluation set.
- Compare deterministic and semantic approaches.
- Add embeddings only after a baseline and evaluation protocol exist.

### Asynchronous work

Introduce a job queue only when notifications, image processing, or semantic
matching justify it. Do not split into microservices.

### Observability

- Structured logs without sensitive payloads
- Request IDs
- Error monitoring
- Query and endpoint latency metrics
- Match-result metrics
- Recovery funnel analytics

---

## Target architecture vision

```text
Accessible Web Client
  │
  │ typed/validated API contract
  ▼
Express Modular Monolith
  ├── Auth middleware
  ├── Validation middleware
  ├── Report service
  ├── Matching service
  ├── Verification service
  ├── Claim service
  ├── Messaging service
  ├── Notification service
  └── Audit service
       │
       ├── PostgreSQL
       ├── Object storage
       └── Background jobs
```

This architecture is sufficient for a strong portfolio project and a realistic
campus-scale deployment.

## Post–Phase 4 presentation architecture

```text
dashboard.html (stable semantic/JavaScript hooks)
  ├── css/style.css          compatibility and feature styles
  ├── inline shell rules     existing compatibility layer
  └── css/modern.css         authoritative shared visual system
        ├── design tokens
        ├── stable shell/container geometry
        ├── dashboard/queue/card patterns
        ├── form/message/modal patterns
        └── 1100/768/560/390 responsive rules
```

Student and Admin dashboards share the same markup containers and toolbar
controls. Role-dispatched modules populate those surfaces with different
labels, metrics, data, and actions. This keeps visual proportions stable while
backend authorization remains the only authority.

No new API or persistence layer was introduced. UI metrics are projections of
existing report/claim payloads; sorting and filtering are client-side views of
already-authorized collections and never replace backend ownership checks.

## Integrated authentication presentation

```text
login.html + css/auth.css + js/login.js
  ├── exact development-domain validation
  ├── POST /auth/signup → persisted database role
  ├── POST /auth/login → HTTP-only session
  ├── PATCH /auth/workspace when assigned and required
  └── canonical current user → existing dashboard shell
```

`/auth/me` restores refreshes and direct access. Browser state supports display
and routing only; middleware, database roles, ownership, and active preferred
workspace remain the authorization boundary.

## Shared visual identity

Authentication and the main shell share a coherent token family and controlled
session handoff. `css/auth.css` is the visual reference;
`css/modern.css` defines equivalent application-shell tokens. The sidebar
welcome component consumes the cached public session user via `getCurrentUser`;
it never consumes credentials or grants authorization.

## Dashboard initialization and failure boundary

```text
DOMContentLoaded
  -> authReady: bounded GET /auth/me
  -> hash router selects Student/Admin Dashboard
  -> one coalesced Dashboard load
       |-> required reports request (10-second bound)
       `-> optional claims request (10-second bound)
  -> success | cached warning | retryable error
```

Student uses `GET /reports/discover`; Admin uses `GET /reports`. Both request
`GET /claims` in parallel. One response can no longer prevent the other from
settling, concurrent navigation cannot duplicate loads, and every branch
removes skeleton state. Endpoints, authorization, database queries, matching,
and lifecycle contracts are unchanged.

The measured Dashboard query plan on 23 reports completed in 0.106 ms. Its
small-table sequential scan is appropriate; no speculative index was added.

## Password recovery architecture

```text
Forgot Password -> generic rate-limited request
  -> random token -> SHA-256 hash in password_reset_tokens
  -> optional server-only Resend link
  -> valid unused token FOR UPDATE
  -> bcrypt password + used_at + revoke sessions -> Sign In
```

Disabled/failed delivery removes the undelivered token. Raw tokens exist only
inside the delivery boundary.

## Role-scoped Dashboard reads

Student `/reports/discover` returns own active Found, matched-to-own-Lost, or
claimed Found records. Admin `/reports/active-found` requires the active Admin
role and returns every active Found row. Caches are keyed by authenticated user.
Vercel `/api/runtime-config.js` emits only `BACKEND_API_URL`.
