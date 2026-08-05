# Campus Lost & Found — Feature Catalog

## Stabilized shared workspace experience

**Purpose:** Keep Student, Admin, Messaging, Claim Review, and Profile Details
inside one consistent product shell while ensuring the selected workspace also
controls backend authorization.

**How it works:** `dashboard.html` owns every active module. `router.js`
rebuilds role-specific navigation and initializes the selected module on every
visit. `common.js` persists workspace changes through `PATCH /auth/workspace`,
updates trusted browser display context, clears stale report cache, and refreshes
the shared dashboard. Legacy Admin/Profile URLs redirect to canonical hashes.

**User workflow:** Enter the application → choose Student or Admin → navigate
without leaving the shared layout → open Profile Details, Claims, or Messaging
→ see current data without manually refreshing.

**Backend logic:** Authorization requires both an assigned role and a matching
active `preferredWorkspace`. Student report reads are ownership scoped to Lost
Reports; Admin reads remain global.

**Frontend interaction:** Navigation, title, active item, role label, data, and
responsive layout update together. Loading states resolve into data, empty
states, or retryable user-facing errors.

**Database involvement:** `users.preferred_workspace` stores active context;
`user_roles` stores available workspaces. Claims retain both Found `report_id`
and `lost_report_id` relationships.

**API endpoints:** `PATCH /auth/workspace`, `GET /auth/me`, `GET /reports`,
`GET /claims`, and messaging endpoints.

**Files involved:** `dashboard.html`, `js/router.js`, `js/common.js`,
`js/profile.js`, `js/claim.js`, `js/report.js`, `js/admin-claims.js`,
`js/admin-dashboard.js`, `js/admin-messages.js`,
`backend/middleware/authorize.js`, and
`backend/controllers/reportController.js`.

**Connected features:** Authentication, role assignments, reports, matching,
claims, Admin review, messaging, profile statistics, and browser caching.

**Future improvements:** Replace compatibility documents with server redirects
when deployment routing supports them; add automated browser accessibility and
visual-regression coverage.

This catalog documents implemented, partial, and planned product features.
“Implemented” does not imply production security unless explicitly stated.

## Temporary local authentication bypass

### Purpose

Allow core Lost & Found workflows to be exercised without repeatedly using the
login/signup screens.

### How it works

When `DEV_AUTH_BYPASS=true` outside production, missing sessions resolve to a
real PostgreSQL development account with Student and Admin roles. Normal
session validation still runs first.

### User workflow

Start the API and frontend, open the root page, and continue directly to the
dashboard. Switch Student/Admin workspaces normally.

### Backend logic and database involvement

`developmentAuthService.js` creates/reuses the development user and normalized
roles. No schema change was required.

### Frontend interaction and API endpoints

The root entry checks `/auth/me`; `/auth/development-status` exposes only
whether the safe local mode is active.

### Files involved

Authentication config/middleware/controller/routes, development auth service,
`.env.example`, local `.env`, root entry page, and authentication tests.

### Connected features and future improvements

All authorized reports, matches, claims, messages, notifications, and admin
workflows use this identity. Set the flag to `false` when login work resumes.

### Local CORS connection

Credentialed browser requests are allowed from `localhost` and `127.0.0.1` on
ports 4173 and 5500. Preflight is handled before authentication and routes.
Production remains restricted to explicitly configured origins.

## Phase 3 implemented feature group

### Purpose

Turn authenticated prototype screens into a server-authorized recovery
workflow with durable matches, notifications, controlled claims, and auditable
administrator decisions.

### How it works

The session service loads normalized database roles and a preferred workspace.
Authorization middleware and ownership-scoped SQL protect application
resources. Report creation persists eligible scored matches and notifications.
Claims may link an owned Lost Report to a suggested Found Item or retain
validated manual item context, then progress through cancellation, review,
decision, expiration, and history states.

### User workflow

Students and administrators may create Lost or Found Reports. Students receive
automatic match notifications, maintain up to three active claims per Lost
Report, cancel before review, and close owned Lost Reports without deletion.
Administrators review claims, inspect preselected related claims, decide
transactionally, and record private notes.

### Backend logic

`authorize.js` checks normalized roles. Controllers enforce ownership.
`matchingWorkflowService` persists/deduplicates matches and notifications.
Claim decisions and report closure use transactions and row locks.
`claimExpirationService` runs at startup and hourly.

### Frontend interaction

Workspace options reflect server roles and persist through `/auth/workspace`.
Accessible confirmation dialogs support cancellation and report closure. The
approval dialog supports related-claim choices and optional Admin Notes.
`notifications.html` provides loading, empty, error, list, and read states.

### Database involvement

Migration 003 adds `user_roles`, `report_matches`, `notifications`,
`claim_admin_notes`, `claim_history`, preferred workspace, report lifecycle,
and claim review/expiration/rejection fields and indexes.

### API endpoints

Workspace preference, authorized report access/matching/closure, claim
cancel/review/related/decision/Admin Notes, and notification list/read routes.

### Files involved

Migration 003; authorization, claim policy, matching workflow, notification,
and expiration services; relevant routes/controllers; workspace, report,
claim, dashboard, admin-claim, notification, and shared-style frontend files.

### Connected features

Authentication, matching, reports, claims, review, messaging, profiles, audit
history, item return, and future analytics.

### Future improvements

Durable background jobs, email/push delivery, object storage, schema-based
validation, and broader end-to-end browser/API coverage.

## 1. Account signup and login

### Purpose

Create student accounts, establish trusted server identity, and maintain
expiring authenticated sessions.

### How it works

Signup validates name, normalized email, and password boundaries, hashes the
password with bcrypt using 12 salt rounds, and inserts a user. Login verifies
the hash, creates a random 256-bit token, stores only its SHA-256 hash, and
returns the raw token in an HTTP-only cookie.

### User workflow

1. Open `login.html`.
2. Choose login or signup.
3. Enter credentials.
4. On successful login, the browser receives an HTTP-only session cookie.
5. `/auth/me` confirms the user; only display fields are browser-cached.
6. Logout revokes the session and clears cookie/cache state.

### Backend logic

`authController.js` handles signup, login, logout, `/auth/me`, and protected
profile lookup. `authService.js` owns validation, hashing, token creation,
session lookup, and revocation. Middleware derives `req.user`.

### Frontend interaction

`login.js` manages form modes, Gmail-only client validation, credentialed API
calls, server-confirmed redirects, and status text. `common.js` sends cookies,
checks `/auth/me`, and performs server logout.

### Database involvement

The `users` table stores name, unique email, bcrypt password hash, and creation
time. `users.role` defaults to `student`. `sessions` stores user relationship,
token hash, expiry, activity, revocation, user agent, and IP address.

### API endpoints

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/profile/:email`

### Files involved

- `login.html`
- `js/login.js`
- `js/common.js`
- `js/userContext.js`
- `backend/routes/authRoutes.js`
- `backend/controllers/authController.js`
- `backend/services/authService.js`
- `backend/middleware/authenticate.js`
- `backend/config/auth.js`
- `backend/utils/sessionCookie.js`
- `backend/server.js`

### Connected features

Profiles, report ownership inference, claim identity, role-aware navigation,
administrator UI, and messaging.

### Future improvements

- Role and resource authorization
- Normalized multi-role assignments so one session can access Student Space and
  Admin Space when authorized
- Database-backed preferred default workspace validated against assigned roles
- Explicit CSRF review if future cross-site cookie requirements change
- Remove Gmail-only restriction or replace it with a deliberate campus policy
- Password reset and account verification

## 2. Report creation and image upload

### Purpose

Let campus users publish Lost or Found item reports with enough context to
support discovery and matching.

### How it works

The browser builds multipart `FormData`. Multer optionally stores an image in
`backend/uploads`. The controller validates report type and item category,
inserts the report and returns `{ report, matches }`. Only Lost creation loads
eligible active Found candidates and calculates matches; Found creation returns
an empty match list and adds future candidate inventory.

### User workflow

1. Choose Lost or Found.
2. Select an item category.
3. Enter item, location, date, contact, and description information.
4. Optionally select an image and review its preview.
5. Submit the report.
6. For Lost, review immediate matching results or the no-match state. For
   Found, receive success and return to Dashboard.

### Backend logic

`reportController.createReport` derives owner ID/name/email from `req.user`,
maps item fields to SQL and inserts the row. For Lost only, it selects existing
`category='Found' AND lifecycle_status='active'` rows, invokes the matching
workflow, and returns ranked matches. Found returns `matches: []`.

### Frontend interaction

`report.js` validates required inputs, previews the image, prevents duplicate
submission and shows loading/error feedback. Lost renders Potential Matches;
Found shows success and navigates to Dashboard.
It runs in the main application shell; the old report URL redirects to it.

### Database involvement

The `reports` table stores item details, type, item category, reporter contact
data, descriptions, statuses, image URL, timestamps, and a nullable
authenticated `user_id` owner relationship. Historical rows may remain null.

### API endpoints

- `POST /reports`
- `GET /reports/:id`

### Files involved

- `dashboard.html`
- `report.html` (compatibility redirect)
- `js/report.js`
- `backend/routes/reportRoutes.js`
- `backend/controllers/reportController.js`
- `backend/services/reportMatchingService.js`
- `css/style.css`

### Connected features

Explainable matching, dashboard discovery, claim initiation, profiles, uploads,
and administrator review.

### Future improvements

- Ownership authorization and private/public response separation
- Schema-based validation
- Neutral `incident_date` and canonical `report_type` naming
- Public/private fields
- File-size, MIME, and decoded-content validation
- Durable object storage and thumbnails
- Preserve Lost-only initiation and active-Found candidate eligibility

## 3. Explainable report matching

### Purpose

Surface plausible existing active Found Reports immediately after a Lost Report
while showing users why each candidate may be relevant.

### How it works

The pure backend service rejects same-type and self comparisons, then awards:

| Evidence | Points |
| --- | ---: |
| Same item category | 25 |
| Similar item name | 25 |
| Similar location | 20 |
| Similar description | 15 |
| Same report date | 15 |
| Date within three days | 10 |

Candidates below 30 points are excluded and the remainder are sorted by score.

### User workflow

1. Submit a Lost Report.
2. See ranked candidates immediately.
3. Compare submitted and candidate reports side by side.
4. Review Match Score evidence.
5. View details, dismiss a suggestion, start a claim, or return to dashboard.

### Backend logic

`reportMatchingService.js` contains pure normalization, tokenization, word
overlap, date difference, scoring, filtering, and sorting functions.
`matchingWorkflowService.js` enforces Lost initiation and active Found candidate
direction before persisting the canonical relationship and notification.

### Frontend interaction

`report.js` renders score evidence returned by the API. It explicitly explains
that Match Score is not probability or AI confidence.

### Database involvement

Lost insertion is followed by selection of existing active Found Reports.
Matching runs in application memory against those DTOs and persists qualifying
pairs in `report_matches`. Found insertion performs no immediate match query.

### API endpoints

- `POST /reports` returns `report` and `matches`

### Files involved

- `backend/services/reportMatchingService.js`
- `backend/controllers/reportController.js`
- `backend/test/reportMatchingService.test.js`
- `js/report.js`
- `dashboard.html`
- `report.html` (compatibility redirect)
- `css/style.css`

### Connected features

Report creation, candidate review, claim initiation, dashboard navigation, and
future match feedback.

### Future improvements

- SQL candidate pre-filtering
- Persisted dismissals and feedback
- Location normalization
- Spelling, stemming, and synonyms
- Labeled evaluation data and precision/recall metrics
- Evaluated hybrid semantic matching

## 4. Report dashboard, search, and filtering

### Purpose

Provide a searchable view of campus reports and quick entry into report details
or claims.

### How it works

The student dashboard loads all reports, caches them in `localStorage`, filters
them in the browser, calculates display statistics, and renders cards. The
administrator dashboard combines reports with claim information.

### User workflow

1. Open the dashboard.
2. Review cached placeholders or loading skeletons.
3. Search by item or location.
4. Filter by report type/item category and claim state.
5. Open details or begin a claim.

### Backend logic

`GET /reports` selects all reports in reverse creation order. The administrator
surface also calls `GET /claims`.

### Frontend interaction

`dashboard.js` and `admin-dashboard.js` maintain separate caches, filters,
statistics, cards, and modal logic.

### Database involvement

Reads all `reports`; the administrator view also reads all `claims`.

### API endpoints

- `GET /reports`
- `GET /reports/:id`
- `GET /claims`

### Files involved

- `dashboard.html`
- `admin-dashboard.html`
- `js/dashboard.js`
- `js/admin-dashboard.js`
- `css/style.css`
- `css/model.css`
- `backend/controllers/reportController.js`
- `backend/controllers/claimController.js`

### Connected features

Reports, claims, profiles, administrator review, and matching follow-up.

### Future improvements

- Server-side pagination and filtering
- Indexed search
- Public/private DTOs
- Shared rendering and API client
- Accessible dialog focus management

## 5. Claim submission

### Purpose

Collect claimant identity and ownership evidence for administrator review.

### How it works

Claims may be standalone or linked to a report. The browser sends multipart
evidence. The controller derives claimant email/user ID from the authenticated
session, validates remaining required text, and inserts a pending claim.

### User workflow

1. Start a claim from a match/report or open the general form.
2. Enter student ID, email, item, location, and private description.
3. Optionally upload evidence.
4. Submit and receive success/error feedback.

### Backend logic

`claimController.createClaim` derives identity from `req.user`, validates
fields, normalizes `report_id`, writes the claim, and returns a camelCase DTO.

### Frontend interaction

`claim.js` supports SPA navigation and `?reportId=` deep linking, pre-fills the
prototype email, previews evidence, and sends multipart data.

### Database involvement

The `claims` table stores optional report/user links, claimant identifiers,
item/location, private description, image, status, and timestamp.

### API endpoints

- `POST /claims`
- `GET /claims`

### Files involved

- `dashboard.html`
- `claim.html` (compatibility redirect)
- `js/claim.js`
- `backend/routes/claimRoutes.js`
- `backend/controllers/claimController.js`

### Connected features

Matching, reports, administrator review, messaging, and item return.

### Future improvements

- Verify report existence instead of converting invalid IDs to null
- Ownership policy and private evidence DTOs
- Structured verification questions
- Claim submission integration tests

## 6. Administrator claim review

### Purpose

Allow campus staff to inspect claim evidence and approve or reject recovery
requests.

### How it works

The administrator UI loads every claim. Approve/reject actions update claim
status. Approval of a linked claim also sets the report claim state to claimed.

### User workflow

1. Switch to administrator mode.
2. Search and open claim requests.
3. Review claimant and evidence details.
4. Message the student if needed.
5. Approve or reject.

### Backend logic

`updateClaimStatus` validates the requested state, fetches the claim, checks the
linked report, updates the claim, and then updates the report on approval.
These statements are currently not transactional.

### Frontend interaction

`admin-claims.js` and `admin-dashboard.js` provide cards, detail modals, status
actions, and embedded messaging.

### Database involvement

Reads and updates `claims`; approval also updates `reports.claim_status`.

### API endpoints

- `GET /claims`
- `POST /claims/:id/decision`

### Files involved

- `dashboard.html`
- `admin-claims.html`
- `admin-dashboard.html`
- `js/admin-claims.js`
- `js/admin-dashboard.js`
- `backend/controllers/claimController.js`

### Connected features

Claims, reports, messaging, authentication/roles, and return status.

### Future improvements

- Trusted administrator authorization
- Transaction, row locks, and database competing-claim defense
- Detect active claims for the same Lost report and present pre-selected closure
  checkboxes; close only the administrator-confirmed selections
- Distinguish manual rejection (`Ownership could not be verified.`) from
  automatic rejection after verified return to another claimant
- Optional administrator notes stored in claim history and excluded from all
  student-facing data
- Enforce three active claims per Lost report, not per account; closed claims
  release capacity
- Allow pre-review student cancellation and non-destructive student closure of
  a Lost report
- Configurable 60-day inactivity expiration with student notification
- Audit events
- Accessible confirmation dialogs

## 7. Claim-specific messaging

### Purpose

Keep student and administrator communication attached to the ownership claim.

### How it works

Conversation endpoints join messages to claims and group them by claim. History
loads messages chronologically. Sending verifies that the claim exists and
inserts sender identity derived from the authenticated session.

### User workflow

1. Open the conversations page or claim detail.
2. Select a claim.
3. Review message history.
4. Send a message.
5. Reload/revisit to receive later messages.

### Backend logic

`messageController.js` aggregates conversations and retrieves claim messages.
For inserts it derives sender ID, email, and database role from `req.user`. It
does not yet authorize conversation participation.

### Frontend interaction

`student-messages.js`, `admin-messages.js`, and embedded admin claim chat render
conversation lists and message bubbles. Real-time and persistent unread
functions are stubs. `my-claims.js` is a legacy direct-Supabase exception.

### Database involvement

The `messages` table belongs to `claims` through `claim_id` and stores duplicate
sender role fields, recipient role, sender ID, session-derived
`sender_user_id`, message, and timestamp.

### API endpoints

- `GET /messages/conversations`
- `GET /messages/:claim_id`
- `POST /messages`

### Files involved

- `dashboard.html`
- `student-messages.html`, `admin-messages.html`, `admin-claims.html`, and
  `my-claims.html` (compatibility redirects)
- `js/student-messages.js`
- `js/admin-messages.js`
- `js/admin-claims.js`
- `js/my-claims.js`
- `backend/routes/messageRoutes.js`
- `backend/controllers/messageController.js`

### Connected features

Claims, administrator review, trusted identity, notification state, and item
return coordination.

### Future improvements

- Conversation authorization
- Keep data access behind the authorized Express API
- Persistent unread/read timestamps
- Real-time delivery or reliable polling
- Notification preferences and email delivery
- Consistent closed-claim behavior

## 8. Role-aware application shell

### Purpose

Provide student and administrator navigation within the main static
application.

### How it works

`dashboard.html` contains multiple `.spa-page` sections. `common.js` first
validates `/auth/me`; `router.js` then uses the location hash, a page registry,
and the cached server role to show a section and dispatch its initializer.

### User workflow

1. Open `dashboard.html`.
2. See role-specific sidebar links.
3. Navigate between dashboard, report, claims, review, and conversations.
4. Use browser history to move among sections.

### Backend logic

Authentication middleware protects the underlying non-public API routes.
Frontend page guards remain presentation behavior, not authorization.

### Frontend interaction

The router renders sidebar HTML, updates page title/active navigation, updates
history, and calls student/admin initializers.

### Database involvement

None directly.

### API endpoints

None directly; registered pages invoke their own endpoints.

### Files involved

- `dashboard.html`
- `js/router.js`
- `js/common.js`
- `js/userContext.js`
- All registered page modules

### Connected features

Every primary frontend feature.

### Future improvements

- Polished session-expired and unauthorized states
- Remove browser role switching
- `aria-current` navigation state
- Reduce global dependencies and inline handlers

## 9. Profile and report history

### Purpose

Show a user summary and their submitted reports.

### How it works

The profile page fetches a user by browser-stored email, fetches all reports,
and filters reports by matching the email string.

### User workflow

1. Open profile.
2. View account name, email, join date, statistics, and submissions.
3. Temporarily edit the displayed name.

### Backend logic

Profile lookup returns a public user record for any requested email.

### Frontend interaction

`profile.js` handles loading, error, empty, profile, statistics, and local-only
edit behavior.

### Database involvement

Reads `users` and all `reports`. A nullable report-owner foreign key now exists,
but current controllers do not populate it and the profile still filters by
email.

### API endpoints

- `GET /auth/profile/:email`
- `GET /reports`

### Files involved

- `profile.html`
- `profile-detail.html`
- `js/profile.js`
- `backend/controllers/authController.js`
- `backend/controllers/reportController.js`

### Connected features

Accounts, report ownership, report dashboard, and claim statistics.

### Future improvements

- Authenticated `/auth/me`
- Database-backed report ownership
- Persistent profile update or removal of edit controls
- Correct claim/recovery statistics
- Private account DTO

## 10. Local upload storage

### Purpose

Support images for reports and private claim evidence during local development.

### How it works

Multer generates a timestamp/random filename and writes to `backend/uploads`.
Express serves that directory from `/uploads`.

### User workflow

Users select an image, see a local preview, submit it with the form, and later
see the stored image in cards/details.

### Backend logic

Report and claim routes each define Multer disk storage. No size, MIME, or file
content restrictions are configured.

### Frontend interaction

Report and claim modules use `FileReader` for previews and resolve relative
upload URLs against `BASE_URL`.

### Database involvement

The relative or remote URL is stored in `reports.image_url` or
`claims.image_url`.

### API endpoints

- `POST /reports`
- `POST /claims`
- `GET /uploads/:filename`

### Files involved

- `backend/routes/reportRoutes.js`
- `backend/routes/claimRoutes.js`
- `backend/server.js`
- `js/report.js`
- `js/claim.js`
- Dashboard and administrator rendering modules

### Connected features

Reports, claims, matching comparison, dashboard cards, and administrator
evidence review.

### Future improvements

- Upload limits and type validation
- Image decoding and sanitization
- Thumbnails and compression
- Managed object storage
- Private evidence authorization
- Cleanup of abandoned uploads

## 11. Item return lifecycle

### Purpose

Represent successful recovery after claim review.

### How it works

The current implementation treats an approved claim and
`reports.claim_status = 'claimed'` as the terminal state.

### User workflow

1. Student claims a report.
2. Administrator approves.
3. Report appears claimed.

### Backend logic

Approval updates the claim and then the linked report through separate SQL
queries. A new partial unique index prevents two linked claims from both being
stored as approved, but the application flow is not yet transactional.

### Frontend interaction

Dashboards and badges display claim/report state. There is no dedicated pickup
or returned confirmation workflow.

### Database involvement

Uses `claims.status`, `reports.claim_status`, and the overlapping legacy
`reports.status`.

### API endpoints

- `POST /claims/:id/decision`
- `PATCH /reports/:id`

### Files involved

- `backend/controllers/claimController.js`
- `backend/controllers/reportController.js`
- Dashboard, profile, and administrator frontend modules

### Connected features

Claims, administrator review, messaging, profiles, and future recovery
analytics.

### Future improvements

- Canonical report lifecycle
- Transactional adjudication
- Handoff verification and return timestamp
- Pickup credentials
- QR chain of custody
- Audit events and recovery analytics

## 12. Versioned database migrations

### Purpose

Make schema evolution ordered, repeatable, reviewable, and safe across new and
existing PostgreSQL databases.

### How it works

Migration files use `NNN_descriptive_name.sql`. The runner acquires a
PostgreSQL advisory lock, creates the migration ledger when necessary, verifies
applied-file checksums, and applies each pending file in its own transaction.
Failures roll back and are not recorded.

### User workflow

This is an operator/developer workflow:

1. Configure `DATABASE_URL`.
2. Run `npm run migrate`.
3. Optionally run `npm run migrate:status`.
4. Start the API with `npm start`.
5. Add a new ordered file for future schema changes; never edit an applied file.

### Backend logic

`scripts/migrate.js` discovers and validates files, calculates SHA-256
checksums, serializes runners with an advisory lock, writes
`schema_migrations`, reports status, and exposes the readiness assertion used
by server startup.

### Frontend interaction

None. Phase 1 deliberately introduces no frontend changes.

### Database involvement

The migration ledger records version, filename, checksum, applied time, and
execution time. The first two migrations define the compatibility baseline and
add roles, sessions, ownership relationships, constraints, and indexes.

### API endpoints

None. The server checks migration state before opening its HTTP listener.

### Files involved

- `backend/migrations/001_initial_schema.sql`
- `backend/migrations/002_identity_authorization_foundation.sql`
- `backend/migrations/README.md`
- `backend/scripts/migrate.js`
- `backend/server.js`
- `backend/package.json`
- `backend/test/migrationRunner.test.js`

### Connected features

Every PostgreSQL-backed feature: accounts, reports, matching, claims,
administrator review, messaging, profiles, and future authorization.

### Future improvements

- Add a new migration for every schema change
- Validate compatibility constraints after legacy data cleanup
- Add database-backed migration tests to CI
- Add rollback/forward-fix operational guidance
- Add deployment automation that runs migrations before API rollout

## 13. Transactional claim recovery lifecycle

### Purpose

Guide a real item from student discovery through private ownership proof,
administrator review, physical return, and auditable case closure without
duplicating identity or report data.

### How it works

Found Report Details offers **Claim This Item**. The claim page receives only
report identifiers, loads the authenticated student and canonical report
facts, and makes those values read-only. The API owns an explicit transition
map and applies every decision with report locks, timeline events, and
notifications in a PostgreSQL transaction.

### User workflow

1. Student opens an eligible Found Report and selects Claim This Item.
2. Identity, Found Report, and related Lost Report fields are prefilled.
3. Student supplies ownership verification and optional support/comments.
4. Admin reviews, approves, rejects with a required reason, or requests proof.
5. Action Required lets the student update only verification on the same claim.
6. Admin records physical return and closes the case; the claim is archived.

### Backend logic

`claimLifecycleService.js` permits only explicit state transitions. Claim
controllers enforce authentication, active workspace, ownership, terminal-state
immutability, duplicate prevention, one approved owner, and transactional
history/notification/report updates. Resubmission increments
`verification_version` rather than inserting another claim.

### Frontend interaction

The shared dashboard adds the primary claim action, read-only smart-prefill
form, explicit next-step status labels, accessible validation/dialogs, loading
and success/error feedback, Update Verification, Admin decision actions, and a
shared timeline. Existing responsive shared-shell styles remain canonical.

### Database involvement

Migration 004 adds `users.student_id`; claim verification/support/comment and
request fields; version/resubmission, approval, return, and archive timestamps;
expanded claim/report lifecycle checks; and supporting uniqueness/queue
indexes. Existing claim history and notification tables store the audit trail.

### API endpoints

- `GET /reports/discover`
- `POST /claims`
- `POST /claims/:id/review`
- `POST /claims/:id/request-verification`
- `PATCH /claims/:id/verification`
- `POST /claims/:id/decision`
- `POST /claims/:id/return`
- `POST /claims/:id/close`
- `GET /claims`

### Files involved

- `backend/migrations/004_transactional_recovery_lifecycle.sql`
- `backend/services/claimLifecycleService.js`
- `backend/controllers/claimController.js`
- `backend/controllers/reportController.js`
- `backend/routes/claimRoutes.js`, `backend/routes/reportRoutes.js`
- `dashboard.html`, `js/dashboard.js`, `js/claim.js`, `js/admin-claims.js`
- `backend/test/phase4RecoveryLifecycle.test.js`

### Connected features

Authentication supplies trusted identity; authorization supplies ownership and
workspace boundaries; matching supplies the related Lost/Found pair;
notifications communicate turns; messaging remains claim-scoped; reports are
locked and archived by final recovery state.

### Future improvements

- Database-backed HTTP integration tests in isolated CI PostgreSQL
- Pickup appointment or single-use handoff credential
- Dedicated searchable Admin archive view
- WebSocket/SSE delivery in addition to durable notification polling
- Recovery-time analytics built from timeline events

## 14. Role-specific report discovery and tracking

### Purpose

Make each workspace behave like a university Lost & Found operation: students
discover available inventory and privately track reports/claims, while staff
separately monitor Lost Reports, intake Found items, and review claims.

### How it works

Student Dashboard calls only `/reports/discover`. Active Found Reports have
private contact fields removed; matches to the student's active Lost Reports
rank first by Match Score, followed by all unmatched inventory. Dedicated
owner/admin endpoints supply the private Lost Report workspaces.

### User workflow

1. Student submits a Lost Report and sees it in My Reports.
2. Admin sees it in Student Lost Reports.
3. Admin records physical inventory through Add Found Item.
4. It appears on Student Dashboard, with relevant matches first.
5. Student opens the Found Report, claims it, and follows My Claims through the
   unchanged transactional lifecycle.

### Backend logic

`listLostReports` derives status from report lifecycle, latest claim, and
potential matches. Role middleware protects `/reports/mine` and
`/reports/student-lost`. Dashboard claim creation requires an active Found
Report; an owned persisted suggested Lost Report is optional and validated when
supplied. New Claim uses the same controller with validated manual item context
and no report identifiers.

### Frontend interaction

The shared router exposes role-specific modules without legacy pages. Found
cards show photo, description, location, date, availability, View Report, and
Claim This Item. Dedicated lists include loading, empty, filter, detail, close,
timeline, error, and re-verification states and collapse cleanly at 390px.

### Database involvement

Migration 005 adds normalized `report_images`, ordered per report with cascade
deletion and uniqueness. Legacy primary images are backfilled. Report, photos,
matches, and notifications commit in one transaction.

### API endpoints

- `GET /reports/discover`
- `GET /reports/mine`
- `GET /reports/student-lost`
- `POST /reports`
- `GET /claims`
- `POST /claims`

### Files involved

- `backend/migrations/005_report_workspace_refinement.sql`
- Report/claim controllers and report routes
- `dashboard.html`, `js/router.js`, `js/dashboard.js`, `js/report.js`
- `js/report-workspaces.js`, `js/claim.js`, `js/admin-dashboard.js`
- `backend/test/phase4WorkflowRefinement.test.js`

### Connected features

Identity and authorization scope modules; matching orders discovery and updates
Lost status; notifications announce matches/claims; My Claims connects to the
Phase 4 state machine; report lifecycle removes unavailable inventory.

### Future improvements

- Dedicated Admin archive and custody tools
- Pagination for large inventories
- Accessible photo reordering and captions
- Real-time push invalidation
- Database-backed HTTP integration coverage in CI

## 15. Unified Report Item form

### Purpose

Reduce navigation friction by presenting one consistent reporting experience
instead of role-specialized Lost and Found labels over the same implementation.

### How it works

Student and Admin sidebars both navigate to `#report`. Report Type begins with
“Select report type” and requires an explicit Lost or Found choice. The same
validation, multipart payload, API, matching result, and success/error states
run for either selection.

### User workflow

1. Open Report Item.
2. Explicitly select Lost or Found.
3. Complete the existing item, location, date, description, and photo fields.
4. Submit and review the existing matching result.
5. Lost Reports appear in My Reports/Admin monitoring; Found Reports appear on
   Student Dashboard and remain claimable.

### Backend logic

`reportPolicy` permits either authenticated Student or Admin workspace to submit
Lost or Found. `createReport` retains validation, session-derived ownership,
transactional photo persistence, matching, and notifications. Admin-only claim
adjudication and all ownership checks remain unchanged.

### Frontend interaction

`router.js` provides one Report Item link to both roles and normalizes the old
`#add-found-item` compatibility hash to `#report`. `report.js` resets the type
selector to empty whenever the form opens and submits the selected value.

### Database involvement

No schema change. Reports and normalized report photos continue using
migrations 001–005.

### API endpoints

- `POST /reports`

### Files involved

- `dashboard.html`
- `js/router.js`
- `js/report.js`
- `backend/test/phase4ReportFormUX.test.js`
- `backend/test/phase4WorkflowRefinement.test.js`

### Connected features

Report authorization, multi-photo upload, matching, Lost Report tracking,
Found Dashboard discovery, notifications, and the claim workflow.

### Future improvements

- Inline role-aware guidance when a selected type requires another workspace
- Automated database-backed HTTP form submission coverage

## 16. Dual-entry claim submission

### Purpose

Support both discovery-led and manual claims without mixing claim creation into
My Claims or duplicating the transactional recovery implementation.

### How it works

An eligible active Found Report exposes Claim This Item when the student has no
blocking claim for it. That route opens `#claim` with trusted report context.
New Claim opens `#new-claim`, which maps to the same `#page-claim` section in
manual mode. Both submit to `POST /claims` and enter `pending` with the same
history, notifications, Admin queue, verification, decision, return, and close
behavior.

### User workflow

1. Dashboard path: View Report → Claim This Item → verify read-only trusted
   report and account details → add ownership proof → submit.
2. Manual path: New Claim → enter item name, category, location, date,
   description, and ownership proof → submit.
3. Track either claim only in My Claims.

### Backend logic

Dashboard claims require an active Found Report and optionally validate an
owned suggested Lost Report. Manual claims reject report identifiers and
validate every item-context field against the shared category vocabulary.
Dates use strict ISO validation and text inputs have server-side length limits.
Identity always comes from `req.user`. All paths use `createClaim` and the
existing state machine. Historical cancelled, expired, or automatically
rejected claims do not block a new eligible dashboard claim.

### Frontend interaction

`router.js` provides separate New Claim and My Claims links while aliasing New
Claim to the existing claim section. `claim.js` switches only field editability,
labels, required state, and payload context. Loading, validation, success, and
error feedback remain shared.

### Database involvement

Migration 006 adds nullable `item_category`, nullable `item_date`, and required
`manual_entry`. A check constraint requires complete item context and no report
relationships for manual rows; an index supports their Admin review queue.

### API endpoints

- `POST /claims`
- `GET /claims`
- Existing claim review, verification, decision, return, and close endpoints

### Files involved

- `dashboard.html`, `js/router.js`, `js/dashboard.js`, `js/claim.js`
- `backend/controllers/claimController.js`
- `backend/migrations/006_manual_claim_entry.sql`
- `backend/test/phase4RegressionCompletion.test.js`

### Connected features

Authentication, workspace authorization, Found discovery, My Claims, Admin
Claim Requests, history, notifications, re-verification, approval, return,
closure, and expiration.

### Future improvements

- Database-backed HTTP integration tests for multipart manual claims
- Optional later reconciliation of a manual claim with a Found Report by Admin
- Real-time push delivery instead of route-entry refresh

## 17. Canonical shared-shell routing

### Purpose

Ensure every Student and Admin feature opens reliably under different static
server roots without mixing hash navigation and standalone documents.

### How it works

`dashboard.html` is the sole active application shell. `router.js` maps hashes
to `.spa-page` sections, normalizes aliases, applies workspace guards, updates
History state, and dispatches page initializers. Legacy feature documents
immediately replace themselves with their canonical shell route.

### User workflow

Open Dashboard → navigate between Report Item, New Claim, My Reports, My Claims,
Messages, or Admin modules → use Back/Forward or refresh → remain inside the
same shell and workspace without a standalone page request.

### Backend logic

None. Authentication, authorization, reports, matching, claims, notifications,
messages, APIs, and domain transitions were not changed.

### Frontend interaction

Sidebar actions and workflow buttons call `navigate()`. Route parameters are
stored in `history.state`, allowing smart-claim context to survive reload and
browser history traversal. `#messages` canonicalizes to `#conversations`.

### Database involvement

None.

### API endpoints

None added or changed.

### Files involved

- `js/router.js`, `js/report.js`, `js/admin-dashboard.js`
- Legacy report, claim, claims, messages, match, and detail HTML entry points
- `backend/test/routingConsistency.test.js`

### Connected features

Every shared-shell page: Dashboard, reporting, claims, Messages, Profile,
workspace switching, Admin Lost Reports, and Claim Requests.

### Future improvements

- Replace client-side compatibility redirects with deployment-level redirects
- Add automated browser routing tests to CI

## 18. Admin review overlay lifecycle

### Purpose

Ensure temporary claim-decision UI disappears immediately after an Admin action
and cannot accumulate duplicate headers, buttons, listeners, or overlays.

### How it works

`admin-claims.js` assigns every dynamically created action dialog to one active
overlay owner. Mounting a new action first removes any stale action overlay.
Successful actions call one completion function that removes all temporary
overlays, resets the claim-detail state, displays feedback, and reloads the
Claim Requests collection once.

### User workflow

Open Claim Requests → choose Approve, Reject, Request Verification, Mark Item
Returned, or Close Case → complete the action → return immediately to one
updated Claim Requests view with no lingering action panel.

### Backend logic

None changed. Existing requests and responses are used without modification.

### Frontend interaction

Approval guards asynchronous dialog races with a token and disables its submit
button while the request is active. Its fixed viewport overlay centers a
responsive dialog above the unchanged full-width queue and focuses Internal
Verification Notes. Cancel uses the same teardown function and discards
temporary notes. Text-entry dialogs resolve through the centralized owner
rather than removing independent DOM fragments.

### Database involvement

None.

### API endpoints

No endpoints were added or changed.

### Files involved

- `js/admin-claims.js`
- `css/modern.css`
- `backend/test/adminClaimsUiCleanup.test.js`

### Connected features

Admin approval, rejection, verification requests, return, closure, Claim
Requests rendering, and the claim-detail modal presentation.

### Future improvements

- Browser-level DOM lifecycle tests using disposable seeded claims
- Shared focus restoration for all transient dialogs

## Post–Phase 4 shared UI/UX modernization

### Purpose

Present the complete recovery workflow as one trustworthy, information-focused
university operations product without changing the proven Phase 4 transaction
model.

### How it works

`css/modern.css` loads last and supplies shared tokens for the 252px desktop
sidebar, 68px header, 1440px content boundary, spacing, typography, controls,
cards, dialogs, feedback, and responsive breakpoints. Stable existing DOM hooks
remain in `dashboard.html`; role-dispatched JavaScript populates the same SPA
sections.

### User workflow

Students switch among Found discovery, My Reports, Report Item, New Claim, My
Claims, and Messages without shell movement. Administrators use the same shell
for operational metrics, Student Lost Reports, Report Item, Claim Requests, and
Messages. Search, filters, active chips, Clear All, and sort compose without
leaving Dashboard.

### Backend logic

Unchanged. Student metrics project authorized `/reports/discover` and `/claims`
responses. Admin metrics project authorized `/reports` and `/claims` responses.
Filters and sorting operate only on those already-authorized collections.

### Frontend interaction

Search reacts as the user types. Category and availability filters live in a
compact disclosure; active selections appear as removable chips with a numeric
count. Sort supports Match Score relevance, newest, oldest, and item name.
Report cards retain View Report and Claim This Item. Claim Request cards retain
every valid lifecycle action and emphasize records requiring staff attention.

### Database involvement

None added or changed. Counts use existing report lifecycle/claim status fields
and existing claim collections.

### API endpoints

No new endpoints. Uses existing `GET /reports/discover`, `GET /reports`, and
`GET /claims`; all workflow actions keep their Phase 4 API contracts.

### Files involved

- `dashboard.html`
- `css/modern.css`
- `js/dashboard.js`
- `js/admin-dashboard.js`
- `js/admin-claims.js`
- `backend/test/uiModernization.test.js`

### Connected features

Shared routing, Student/Admin workspace switching, Found discovery, matching
relevance, report details, smart claim initiation, My Reports, My Claims
timeline, Claim Requests, Messages, feedback states, and every Phase 4 action.

### Future improvements

Gradually retire overridden compatibility CSS after visual regression coverage
is available; add automated screenshot/keyboard testing and self-host fonts or
icons if deployment requirements demand it. Do not alter lifecycle behavior as
part of that cleanup.

## Isolated authentication UI

### Purpose

Test a polished Sign-In and Sign-Up experience without connecting it to the
frozen Student/Admin application.

### How it works

Both forms share one page and controller. Validation checks required values,
email structure, temporary supported domains, eight-character minimum, and
password confirmation. Existing endpoints retain password hashing, duplicate
handling, credential verification, and sessions. Success renders locally.

### User workflow

Open `login.html` → choose Sign In or Sign Up → submit development credentials
→ see a detected Student/Admin label → remain on the isolated success screen.

### Backend logic

Unchanged. The email-domain label is never submitted as a role and cannot
authorize an application request.

### Frontend interaction

Responsive layout, accessible tabs and labels, password reveal controls, live
feedback, loading/duplicate-submit protection, and an isolated success state.

### Database involvement

No schema changes. Existing user/session persistence remains unchanged; an
`@admin.com` label does not create a database Admin role.

### API endpoints

- `POST /auth/signup`
- `POST /auth/login`

### Files involved

- `login.html`
- `css/auth.css`
- `js/login.js`
- `backend/test/authenticationUiIsolation.test.js`

### Connected features

Authentication services only. Dashboard routing, workspaces, and authorization
remain intentionally disconnected.

### Future improvements

After explicit approval, remove the demo convention and integrate using only
session-derived database roles and preferred workspace.

## Main application visual consistency

### Purpose

Make the frozen Student/Admin application and isolated auth preview feel like
one product without connecting their runtime behavior.

### How it works

Shared application tokens now mirror the auth palette. One sidebar welcome
region is populated during existing sidebar rendering with a display name and
active workspace label.

### User workflow

Open any Student/Admin module → see the same stable shell, green visual family,
slightly wider navigation, and current workspace welcome.

### Backend logic / database involvement / API endpoints

None changed or added.

### Frontend interaction

The sidebar displays an existing user name when present; otherwise it derives a
readable temporary name from the current development email prefix. Workspace
switching updates only the welcome label through the existing render path.

### Files involved

- `dashboard.html`
- `css/modern.css`
- `js/router.js`
- `backend/test/mainApplicationVisualPolish.test.js`

### Connected features

All Student/Admin modules share these presentation tokens and shell geometry.
Authentication remains isolated.

### Future improvements

Replace the temporary display source with trusted profile data only when
authentication integration is explicitly approved.

### Vertical welcome refinement

The welcome component now owns the flexible space between the intrinsic-height
navigation and bottom workspace selector. It centers a circular user icon,
subtle greeting, emphasized development name, workspace label, divider, and
small recovery tagline. A short-height media query reduces spacing and control
heights; the existing mobile breakpoint hides the component.

## Final authentication integration

### Purpose

Connect the completed Sign-In/Sign-Up experience to the existing recovery
application without duplicating or weakening its authorization model.

### How it works

Registration accepts an exact development-domain convention only outside
production: `@student.com` persists Student membership and `@admin.com`
persists Admin membership. Any valid username may be used; no username
whitelist exists. Login creates the existing hashed server session,
and `/auth/me` supplies one canonical public user object to the application.

### User workflow

Create an account → sign in → enter the assigned Student or Admin workspace →
use the existing reports, claims, messages, and Profile modules → refresh or
navigate directly while the session is valid → log out and return to Sign-In.

### Backend logic

The server normalizes the email, compares the complete domain, rejects
unsupported or suffix-spoofed development domains, and writes the matching
role to both the compatibility user field and normalized `user_roles` row.
Production ignores the demo convention. Authentication middleware and
database roles remain authoritative for every protected API.

### Frontend interaction

The auth page validates the selected account type, verifies the role returned
by the server, caches only the public session user for consistent display, and
enters the existing hash-routed dashboard. Sidebar welcome, Profile, header,
and workspace rendering all consume that same canonical user. Logout revokes
the server session and clears the display cache.

### Database involvement

No schema migration was required. The feature uses the existing `users`,
`user_roles`, and `sessions` tables. Passwords remain bcrypt hashes and session
cookies reference hashed, expiring server-side session records.

### API endpoints

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/workspace`

### Files involved

- `backend/config/auth.js`
- `backend/services/authService.js`
- `backend/controllers/authController.js`
- `backend/.env.example`
- `login.html`
- `dashboard.html`
- `js/login.js`
- `js/common.js`
- `js/userContext.js`
- `js/router.js`
- `css/modern.css`
- Authentication and final-integration regression tests under `backend/test/`

### Connected features

Authentication now supplies trusted identity to workspace authorization,
Profile, report ownership, claim ownership, messages, notifications, and the
shared sidebar. It changes no report, matching, claim, or messaging workflow.

### Future improvements

Replace development-domain provisioning with institution-controlled identity
or an administrator invitation process before production deployment. Existing
accounts retain their stored roles; changing an email does not silently
escalate privileges.

### Open-registration verification

Automated coverage explicitly creates distinct `newstudent@student.com` and
`newadmin@admin.com` accounts, verifies their full names and persisted roles,
rejects duplicates and unsupported or malformed domains, rejects an incorrect
password, and accepts the correct password into the Admin preferred workspace.

## Database architecture and migration foundation

### Purpose

Provide a safe, understandable PostgreSQL foundation for all recovery features
and future Phase 6 planning.

### How it works

Six immutable migrations create canonical identity, normalized roles, hashed
sessions, reports/images, durable matches, transactional claims, histories,
private Admin Notes, notifications, messages, and manual-claim context. The
migration runner uses an advisory lock, checksums, and one transaction per file.

### User workflow

Users do not interact with the schema directly. Signup creates identity/role;
reporting creates reports/images/matches; claiming creates the claim timeline;
Admin decisions update claim/report states and notifications; messages remain
claim-scoped through closure.

### Backend logic

Authentication, ownership, matching, lifecycle services, controllers, and
notification/message services use parameterized PostgreSQL queries. Claim
decisions, verification, return, closure, report creation/matching, and
expiration use transactions where multi-record consistency is required.

### Frontend interaction

The frontend receives authorized API projections only; it does not read the
database or determine ownership/roles.

### Database involvement

All 12 public tables and their complete responsibilities are documented in
`DATABASE_ARCHITECTURE.md`. Current integrity and migration drift checks pass.

### API endpoints

All `/auth`, `/reports`, `/claims`, `/notifications`, and `/messages` endpoints
connect to this schema through their existing controllers and services.

### Files involved

- `DATABASE_ARCHITECTURE.md`
- `backend/migrations/001_initial_schema.sql` through
  `006_manual_claim_entry.sql`
- `backend/scripts/migrate.js`
- Backend controllers, services, middleware, and `db.js`

### Connected features

Identity connects to ownership; reports connect to images and Lost/Found
matches; matches connect to claims/notifications; claims connect to history,
Admin Notes, messages, and final recovery states.

### Future improvements

Measure production-scale query plans before adding indexes. Future SSO, email
delivery, advanced search, and analytics may require forward migrations, but no
Phase 6 feature or speculative schema was added during this audit.

## Production-safe runtime logging

### Purpose

Retain useful operational diagnosis without placing personal, authentication,
verification, or message content into server logs or browser error responses.

### How it works

One small logger accepts event names and safe metadata. Error serialization is
restricted to bounded name, code, constraint, and severity values.

### User workflow

All existing workflows behave identically; failures show the same purposeful
validation errors or a generic unexpected-error message.

### Backend logic

Report and message operations log numeric IDs, roles, and counts. Controller,
middleware, and server failures use metadata-only error logging. Known claim
validation/state errors remain actionable; unexpected 5xx errors are generic.

### Frontend interaction

No UI change. Report-creation failures no longer receive raw PostgreSQL message
or code details.

### Database involvement

None. No schema, migration, query, or data change.

### API endpoints

Existing `/auth`, `/reports`, `/claims`, `/messages`, and `/notifications`
contracts remain unchanged except removal of undocumented internal SQL detail
fields from unexpected report-creation 500 responses.

### Files involved

- `backend/utils/safeLogger.js`
- Backend report/message/claim/auth/notification controllers
- Authentication middleware and server startup/expiration logging
- `backend/test/loggingPrivacy.test.js`

### Connected features

The logger protects every backend workflow without participating in business
state, authorization, matching, messaging delivery, or lifecycle transitions.

### Future improvements

A production log transport, correlation IDs, retention policy, and monitoring
integration may be added later while preserving the same sensitive-data rules.

## Server-enforced authentication and authorization

### Purpose

Ensure every protected action uses trusted server identity, persisted roles,
active workspace, and ownership rather than frontend visibility or state.

### How it works

Login creates a random session whose hash is stored in PostgreSQL. Middleware
accepts only active, unrevoked, unexpired sessions, loads the canonical user and
`user_roles`, and supplies `req.user`. Role guards require both membership and
the persisted active workspace. Controllers add resource-owner predicates.

### User workflow

Signup → login → authorized workspace → protected workflow → logout. Legitimate
dual-role users switch only to a database-assigned workspace.

### Backend logic

Admin claim operations use `requireRole("admin")`; Student claim operations use
`requireRole("student")` plus `user_id`; reports branch between Admin scope and
owned Student scope; messages join through owned claims; notification updates
include the authenticated user ID.

### Frontend interaction

Frontend navigation reflects the session user but never grants authority.
Tampering with local storage, URL hashes, form fields, query values, or role
headers cannot alter backend membership.

### Database involvement

Uses existing `users`, `user_roles`, and `sessions` records and existing foreign
keys. No schema or migration change.

### API endpoints

The complete 32-route authorization matrix is documented in `ARCHITECTURE.md`.

### Files involved

- `backend/services/authService.js`
- `backend/middleware/authenticate.js`
- `backend/middleware/authorize.js`
- Existing route/controller ownership checks
- `backend/test/authorizationHardening.test.js`

### Connected features

The same authorization chain protects reports, matching, claims, Admin Notes,
messages, notifications, Profile, workspace switching, and lifecycle actions.

### Future improvements

Replace development-domain registration with institutional identity before
production. SSO/OAuth/SAML and account provisioning were not started in Step 2.

## Hardened server sessions and transport

### Purpose

Protect authenticated browser sessions and the API boundary with safe
production defaults without replacing the existing login architecture.

### How it works

Every login creates a fresh 256-bit opaque token; PostgreSQL stores only its
SHA-256 hash. Middleware reloads the unrevoked, unexpired session and canonical
user roles for every protected request. Environment-aware cookies, restrictive
headers/CORS, and failure-only login throttling protect the transport edge.

### User workflow

Sign in, refresh or use multiple tabs while the session is active, complete the
existing Student/Admin workflows, then log out. Logout revokes the database
session immediately; stale, expired, and revoked cookies receive 401.

### Backend logic

Production defaults to `__Host-campus_session` with `Secure`, `HttpOnly`,
`SameSite=Lax`, path `/`, no Domain, `Max-Age`, and `Expires`. Auth responses use
`no-store`; security headers run before routes. Failed credentials are limited
per hashed IP/email key, while successful login clears the counter.

### Frontend interaction

No UI changed. Existing credentialed fetch, refresh restoration, invalid-session
redirect, workspace switching, and logout behavior remain intact.

### Database involvement

Uses the existing `sessions`, `users`, and `user_roles` tables. No schema,
migration, or data transformation was introduced.

### API endpoints

Applies to `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`, profile,
workspace switching, and every session-protected report, claim, message, and
notification endpoint.

### Files involved

`backend/config/auth.js`, `backend/config/cors.js`,
`backend/utils/sessionCookie.js`, `backend/middleware/securityHeaders.js`,
`backend/services/loginAttemptLimiter.js`, `backend/controllers/authController.js`,
`backend/routes/authRoutes.js`, and `backend/server.js`.

### Connected features

Session identity gates authorization, ownership, workspace switching, reports,
matching, claims, Admin review, messages, notifications, and logout without
altering any downstream business rule.

### Future improvements

Use a shared Redis/edge limiter before horizontal scaling; configure exact
trusted proxies and HTTPS; add session cleanup/management and revoke-all for a
future password change; add CSRF tokens before cross-site cookies; consider
HSTS only when HTTPS is guaranteed end to end. Remember Me is documented below.

## Remember Me

### Purpose

Let a user choose a longer authenticated session on a trusted device without
remembering credentials or bypassing authentication.

### How it works

The Sign In request includes only `rememberMe: boolean`. The server selects the
configured eight-hour normal TTL or 30-day remembered TTL, creates the same
random token, stores its SHA-256 hash, and derives database/cookie expiration.

### User workflow

Enter email and password, optionally check Remember me, sign in, refresh or use
another tab, and log out normally. Explicit logout always ends the session.

### Backend logic

`requestedSessionTtl` rejects non-boolean values and chooses between
`SESSION_TTL_MS` and `REMEMBERED_SESSION_TTL_MS`. Arbitrary client expiry fields
are never read. Existing expiration middleware and throttling remain active.

### Frontend interaction

One accessible checkbox was added near the Sign In password control. It sends
its checked state and does not write passwords or authentication tokens to web
storage.

### Database involvement

The existing `sessions.expires_at` column represents either duration. No schema
change, migration, or `remember_me` column was needed.

### API endpoints

`POST /auth/login` accepts the optional boolean. `/auth/me` restores either
active lifetime and `POST /auth/logout` revokes either one identically.

### Files involved

`login.html`, `css/auth.css`, `js/login.js`, `backend/config/auth.js`,
`backend/controllers/authController.js`, `backend/.env.example`, and focused
authentication/session/UI tests.

### Connected features

Remember Me feeds the unchanged session identity used by role routing,
workspace selection, Profile, reports, claims, messages, and notifications.

### Future improvements

Step 4B AI-assisted description improvement is complete below; Step 4C reusable
smart search remains future work. Remembered-session management/revoke-all may
be added with future account-security features.

## AI-assisted report description improvement

### Purpose

Improve grammar, readability, and structure in Lost/Found descriptions while
retaining the user's facts, uncertainty, identifying details, and authority.

### How it works

An authenticated request sends only the description through a small
provider-independent backend service. Strict instructions forbid invention,
output validation rejects malformed/high-risk output, and the frontend presents
Original and Suggested text without changing the form automatically.

### User workflow

Write a description → optionally select Improve with AI → review the suggestion
→ Use Suggestion, edit it first, or Keep Original → submit through the existing
Report Item flow. AI failure leaves the original intact and submission enabled.

### Backend logic

`POST /description-assistant/improve` requires a valid session, allows ten
requests per user per 15 minutes by default, validates non-empty text up to
5,000 characters, invokes the configured provider, validates plain text and
selected factual-risk signals, and returns only `{ suggestion }`.

### Frontend interaction

The unified `#description` field has one subtle action, loading/error feedback,
an accessible comparison panel, and explicit Keep/Edit/Use controls. Duplicate
requests are blocked. Claim and verification textareas have no AI action.

### Database involvement

None. The user-selected final description is stored in the existing
`reports.description` column through the ordinary report submission. No AI
metadata or provider output is persisted separately.

### API endpoints

`POST /description-assistant/improve` is the only new endpoint. Existing
`POST /reports` and matching APIs are unchanged.

### Files involved

Description-assistant config, service, controller, route, limiter, UI module,
the shared dashboard form/design system, server route registration, environment
example, tests, and synchronized documentation.

### Connected features

The final user-approved text flows to report persistence and the existing
description-overlap matcher. Authentication protects provider cost; safe logging
protects content. No claim, notification, message, or Admin workflow changed.

### Future improvements

Evaluate provider quality/cost on representative campus descriptions, expand
fact-preservation checks only with measured evidence, and consider privacy
retention terms before production. Step 4C search/ranking remains separate.

## Smart report search

### Purpose

Retrieve relevant current or historical Lost/Found Reports when a user knows
only approximate wording, location, spelling, description clues, or time.

### How it works

The backend normalizes a natural-language query, extracts controlled report
signals, obtains candidates allowed for the active server workspace, scores
each candidate, removes irrelevant results, and sorts by relevance. Every result
contains a display score, qualitative label, and contributing field evidence.

### User workflow

Enter a keyword or sentence in the existing Dashboard search → wait for the
ranked response → review why each report matched → open Report Details → follow
the existing report or Claim This Item action. Clearing the input returns to
the ordinary Dashboard discovery list.

### Backend logic

`reportSearchService.js` owns text normalization, stop words, canonical synonym
groups, conservative Levenshtein matching, Lost/Found intent, category, color,
brand, and date parsing. Raw weights are item name 34, description 22, location
20, inferred category 16, date 12, color 8, brand/phrase 8, report type 7, and
active lifecycle 3. Optional weights enter the denominator only when their
signal exists. Results below 18 are excluded unless meaningful text evidence
exists. Labels are Very Strong (90+), Strong (75+), Possible (50+), and Weak.

### Frontend interaction

Student and Admin modules reuse `#globalSearch`. Requests are debounced for 300
milliseconds and previous requests are aborted. The current design system shows
a restrained loading state, detected date label, ranked count, relevance badge,
compact evidence, detailed explanation, empty results, and safe error text.

### Database involvement

No schema change. The controller queries existing `reports` and `report_images`.
Student candidates are active Found inventory plus every report owned by the
authenticated Student; Admin candidates are all retained reports. Each query is
currently capped at 5,000 candidates.

### API endpoints

`GET /reports/search?q=<encoded query>` requires an active session. The server
rejects queries over 500 characters. Empty input returns no ranking so the
frontend can retain default discovery behavior.

### Files involved

`backend/services/reportSearchService.js`, `backend/controllers/reportController.js`,
`backend/routes/reportRoutes.js`, `js/dashboard.js`, `js/admin-dashboard.js`,
`dashboard.html`, `css/modern.css`, and `backend/test/reportSearchService.test.js`.

### Connected features

Reads the same user-approved report descriptions used by automatic matching,
but does not create match relationships. Active Found results continue into the
existing details/claim lifecycle. Authentication and active workspace determine
scope. Search never reads claim evidence, Admin Notes, messages, or sessions.

### Future improvements

Collect anonymized ranking-quality fixtures, add pagination, and measure real
PostgreSQL query plans before introducing trigram/full-text indexes. Expand
synonyms, brands, locations, or semester phrases only from observed campus
queries. Semantic/vector search remains deliberately out of scope.

## Dashboard reliability and measured performance

### Purpose

Ensure first authenticated Dashboard entry never depends on navigating away
and back.

### How it works and user workflow

After sign-in or refresh, session restoration completes within a bounded
window. The workspace starts one coalesced load. Reports and claims settle
independently; reports render even if claim metrics fail, with a warning or
retry instead of an infinite skeleton.

### Backend logic, frontend interaction, and database involvement

No backend, API, or schema logic changed. Student calls authenticated
`GET /reports/discover` plus `GET /claims`; Admin calls `GET /reports` plus
`GET /claims`. Existing PostgreSQL queries remain authoritative. Local
measurements were 2–10 ms for representative APIs and 0.106 ms for the Student
Dashboard query plan.

### Files involved and connected features

`js/common.js`, `js/dashboard.js`, `js/admin-dashboard.js`, and
`backend/test/preDemoStability.test.js`. This connects authentication,
workspace routing, metrics, discovery, claims, cached state, and retry UI.

### Future improvements

Re-measure with production-sized data. Batch Admin notification inserts or
match persistence only after observed growth demonstrates a bottleneck.
