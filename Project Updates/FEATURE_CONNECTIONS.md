# Campus Lost & Found — Feature Connections

## Complete application workflow

```text
Account
  │
  ├── establishes trusted session identity
  ▼
Report creation
  │
  ├── stores item, location, date, description, contact details, and image
  ├── classifies report as Lost or Found
  ▼
Lost Report? ── No (Found) → Active candidate inventory → Dashboard
  │ Yes
  ▼
Explainable matching against existing active Found Reports
  │
  ├── considers only complementary report types
  ├── calculates Match Score and evidence
  └── returns ranked candidates immediately
  ▼
Candidate review
  │
  ├── side-by-side comparison
  ├── view evidence
  ├── dismiss suggestion
  └── begin claim
  ▼
Ownership claim
  │
  ├── links to a report when started from a match
  ├── records claimant details and evidence
  └── enters pending review
  ▼
Administrator review
  │
  ├── reviews report and claim evidence
  ├── communicates with claimant
  └── approves or rejects claim
  ▼
Claim-specific messaging
  │
  ├── preserves the decision conversation
  └── coordinates verification and return
  ▼
Item return
  │
  └── represented today by approved claim / claimed report state
```

## Feature relationship map

| Feature | Depends on | Produces or enables | Current connection quality |
| --- | --- | --- | --- |
| Accounts | Users, user_roles, auth endpoints, sessions, middleware | Trusted multi-role identity and preferred workspace | Complete |
| Report creation | Authenticated user, report form, uploads, reports API, PostgreSQL | Lost initiates matching; Found adds candidate inventory | Complete |
| Report dashboard | Reports API, browser cache | Search, filtering, details, and claim entry | Working; public/private data is not separated |
| Explainable matching | Report creation, matcher service | Ranked complementary candidates and evidence | Completed signature feature |
| Claim submission | Reports, claim form, claims API | Pending ownership-verification record linked to Lost and Found reports | Working; account identity is session-derived |
| Admin review | Claims API, history, Admin Notes, report lifecycle | Transactional decisions and controlled related-claim closure | Complete for Phase 3 |
| Messaging | Authenticated user, claims, messages API | Claim-specific student/admin conversation | Partial; sender identity is trusted but participation access is not enforced |
| Profiles | Auth profile API, ownership-scoped reports/claims APIs | User summary and report history in the shared shell | Working read-only experience; editing is not persistent |
| Uploads | Report/claim forms, Multer, local filesystem | Report and evidence images | Prototype; validation and durable storage are incomplete |
| Item return | Approved claim and claimed report state | Recovery completion | Partial; no custody, pickup, or audit workflow |

## Data relationships

```text
users 1 ─── 0..* claims
reports 1 ─ 0..* claims
claims 1 ── 0..* messages

Current gap:
users and reports have no database ownership relationship.
```

Current schema foundation for the future trusted workflow:

```text
users 1 ─── 0..* reports
users 1 ─── 0..* claims
reports 1 ─ 0..* claims
claims 1 ── 0..* messages
sessions * ─ 1 users
```

The session table is active. Report, claim, and message writes populate their
identity relationships from `req.user`. Historical rows remain nullable.
Authorization policies are enforced by backend roles and ownership-scoped SQL.
During local bypass mode, the same policies run against the database-backed
dual-role development user; only interactive credential entry is skipped.
The local frontend reaches those protected APIs through an explicit
credentialed CORS allowlist covering ports 4173 and 5500 on both loopback
hostnames.

## Report-to-match connection

`POST /reports` inserts either report type. For Lost only, it fetches existing
Found Reports whose canonical lifecycle is `active`, converts rows to the
frontend DTO, and invokes `backend/services/reportMatchingService.js`. The
service:

1. Rejects invalid or same-type report pairs.
2. Rejects identical report IDs.
3. Scores category, item name, location, description, and date evidence.
4. Drops candidates below 30 points.
5. Returns candidates sorted by Match Score.

`js/report.js` renders the returned evidence; it does not recalculate matches.

## Match-to-claim connection

The match card passes both the Found candidate ID and the originating Lost
Report ID to the claim experience. `js/claim.js` requires and submits both
`report_id` and `lost_report_id`. This preserves the complete relationship used
for ownership checks, per-report claim limits, related-claim detection, and
immediate Admin review.

The corrected workflow is Lost-initiated only. New high-scoring matches produce
deduplicated student notifications. A Found submission becomes active candidate
inventory without initiating Potential Matches for its submitter. Returned,
closed, and archived Found Reports never enter the candidate set.

## Claim-to-review connection

Administrators load all claims from `GET /claims`. Review uses
`POST /claims/:id/review`; decisions use `POST /claims/:id/decision`. Approval
also updates linked report lifecycle state transactionally.

The Phase 3 connection now includes:

- Trusted administrator authorization
- Transaction and row locking
- Related-claim selection
- Explicit manual and automatic rejection outcomes

The finalized Phase 3 policy permits three active claims per Lost report. A
rejected, cancelled, expired, or closed claim releases its slot. Students may
cancel before administrator review. Closing a Lost report records `Closed by
Student`, cancels pending claims, stops matching, and preserves history.

The database now has a partial unique index preventing more than one approved
claim for the same non-null report, providing defense in depth before the
transactional service is implemented.

Phase 3 approval must detect active claims related to the same Lost report,
pre-select them as closure suggestions, and let the administrator uncheck any
suggestion. The approval transaction closes only checked claims. It also
records either the manual ownership-verification rejection reason or the
automatic already-returned reason as applicable. Optional administrator notes
stay attached to claim history and never enter student/public DTOs.

## Claim-to-messaging connection

Messages use `claim_id` as the conversation boundary. The conversation lists
join messages to claims, and the history endpoint loads all messages for one
claim.

This is the correct domain boundary. Authentication is required and message
sender identity is session-derived, but conversation-list query filters and
claim participation are not yet authorized.

## Approval-to-return connection

An approved linked claim changes the report to `claim_status = 'claimed'`.
That is the current terminal product state. Future phases should add:

- Verified handoff or pickup state
- Immutable audit events
- Single-use pickup credentials
- QR-supported custody tracking
- Recovery completion timestamp
- Recovery analytics

## Cross-cutting connections

### Identity and privacy

Trusted session identity now connects reports, claims, administration,
messaging, and profiles. The next phase must use that identity for role,
ownership, participation, and private DTO authorization.

A user may hold Student and Admin roles in one session. Assigned roles define
available workspaces; the database-backed preferred workspace is the active
authorization context for each request. Switching rebuilds navigation, clears
stale report cache, and reloads role-specific data in the shared shell. The
backend rejects endpoints outside the active workspace even when the account
owns that role assignment.

### Status model

Report dashboards, claims, administrator review, messaging closure, profiles,
and item return all depend on consistent lifecycle states. The existing
`status` and `claim_status` fields can diverge and must be normalized in a
controlled migration.

Phase 3 must include non-destructive `Closed by Student`, pre-review claim
cancellation, configurable 60-day expiration with notification, and distinct
manual and automatic rejection outcomes in that canonical lifecycle.

### Uploads

Images connect public reports and private ownership evidence, but those have
different privacy requirements. Public/private DTO separation and storage
authorization must reflect that distinction.

### Tests

Matcher unit tests protect scoring invariants. Integration tests must protect
the connections among sessions, ownership, claims, adjudication, privacy, and
conversations.

Migration-runner tests now protect ordered discovery, file immutability,
transactional application, and rollback. Database verification covers both
legacy-schema adoption and clean installation.

Authentication tests protect registration, bcrypt storage, login
success/failure, session hashing/expiry/revocation, cookies, middleware,
logout, and `/auth/me`.

## Authentication connection

```text
Signup → bcrypt user record
Login → credential verification
      → random raw token in HTTP-only cookie
      → SHA-256 token hash in sessions
Request → credentialed CORS
        → authentication middleware
        → session + user lookup
        → req.user
        → report / claim / message identity
Logout → session revocation + cookie clearing
```

## Migration connection

```text
Ordered SQL files
  → migration runner
  → schema_migrations ledger
  → roles / sessions / ownership links / constraints / indexes
  → startup readiness check
  → existing Express application
```

Migrations are an operational dependency of every database-backed feature. The
API does not mutate schema at startup and refuses to start when its database is
behind.

## Phase 4 complete recovery connection

```text
Authenticated Student
  → Owned Lost Report + active Found discovery
  → Found Report Details / Claim This Item
  → server-trusted smart claim submission
  → Pending Admin Review + admin notification
  → Admin Reviewing
      ├─ Request Verification → student notification
      │    → Action Required / Update Verification
      │    → same claim version + timeline
      │    → Pending Admin Review + admin notification
      ├─ Reject with reason → immutable Rejected + student notification
      └─ Approve → ownership/report lock + student notification
           → Mark Item Returned
           → Returned + student notification
           → Close Case
           → claim/report archived with complete shared timeline
```

Matching begins the journey; authentication and authorization establish who
may act; the claim state machine controls whose turn is next; notifications
surface changes; messaging supports clarification; history provides the shared
audit trail; and report lifecycle state prevents future claims after ownership
is locked. Invalid transitions and duplicate claims are rejected by the API,
with database uniqueness as defense in depth.

## Refined workspace workflow

```text
Student Report Lost Item
  ├─→ My Reports (owner-only status)
  ├─→ Admin Student Lost Reports (staff monitoring)
  └─→ matching engine

Admin Add Found Item (+ ordered photos)
  ├─→ matching engine → matched student notification
  └─→ Student Found Dashboard
        ├─ matched inventory first by Match Score
        ├─ all other active Found inventory remains browseable
        └─ View Report → Claim This Item
              → trusted smart prefill
              → My Claims + Admin Claim Requests
              → unchanged transactional recovery lifecycle
```

Dashboard answers “what has been found?”, My Reports answers “what am I still
missing?”, My Claims answers “what am I trying to recover?”, Student Lost
Reports supports staff monitoring, Add Found Item records physical intake, and
Claim Requests controls ownership adjudication.

## Unified report entry connection

```text
Student or Admin sidebar
  → Report Item (one shared form)
  → explicit Report Type
      ├─ Lost → authenticated workspace → My Reports + Admin monitoring
      └─ Found → authenticated workspace → Found Dashboard
  → existing matching + notifications
  → Found Report → unchanged claim recovery lifecycle
```

The form is unified and both authenticated workspaces may report either type.
Session identity, ownership, admin adjudication, and all other authorization
remain server-enforced.

## Dual claim-entry connection

```text
Dashboard → eligible Found Report → Claim This Item
          → trusted report + session identity prefill ┐
                                                     ├→ one claim form
Student sidebar → New Claim → manual item context ───┘
  → POST /claims → Pending Admin Review
  → history + Student/Admin notifications
  → My Claims + Admin Claim Requests
  → unchanged verification/decision/return/closure lifecycle
```

My Claims remains a tracking and response surface only. New Claim is the manual
creation entry. Both paths converge before persistence and remain identical to
the downstream state machine except for durable `manual_entry` context.

## Routing connection

```text
Any active navigation action
  → navigate(canonical route, optional params)
  → dashboard.html#route
  → role guard + matching .spa-page initializer
  → History state preserves params
  → Back / Forward / Refresh restores the same module

Legacy feature.html
  → immediate replace → dashboard.html#canonical-route
```

Routing is the presentation connection across every feature, but it does not
authorize or mutate domain data. The backend remains the authority for identity,
ownership, roles, matching, claims, notifications, and messaging.

## Admin action UI cleanup connection

```text
Admin action dialog
  → fixed centered presentation above full-width Claim Requests
  → existing API action
  → success
  → remove all temporary action overlays
  → reset claim-detail selection
  → show success feedback
  → refresh Claim Requests exactly once
```

Cancel follows the same overlay removal path without calling the API or
changing the claim. This cleanup changes presentation state only. Approval, rejection,
verification, return, closure, notifications, history, authorization, and
database transactions remain owned by their existing backend workflows.

## Post–Phase 4 visual workflow connection

```text
Shared Campus Recovery shell
  ├── Student workspace
  │     ├── real recovery metrics
  │     ├── Search + Filters + Sort
  │     ├── Found cards → Details → Claim This Item
  │     ├── My Reports → Lost report state
  │     ├── New Claim / My Claims → lifecycle + timeline
  │     └── Messages
  └── Admin workspace
        ├── real operational metrics
        ├── report directory and Student Lost Reports
        ├── Claim Requests attention queue
        │     └── unchanged Review → Verify/Approve/Reject → Return → Close
        └── Messages
```

The design layer does not create a second workflow. It makes the existing
report-to-return journey visually continuous: matching relevance influences
Found-item ordering; the same report card opens details and smart claim entry;
claim status feeds Student metrics/My Claims and Admin metrics/Claim Requests;
status changes continue to drive the same timelines and notifications. Backend
authorization and ownership determine the data before any UI projection.

## Isolated authentication connection boundary

```text
Sign In / Sign Up
  → temporary domain validation (display label only)
  → existing secure authentication endpoint
  → isolated success state
  ⛔ no dashboard redirect
  ⛔ no application identity-cache write
  ⛔ no permission assignment
```

Future integration remains server session → database roles → preferred
workspace → authorized dashboard. This sprint stops before that boundary.

## Shared visual identity connection

```text
Authentication design reference
  → shared green color family
  → Student/Admin shell tokens
  → sidebar welcome from existing display data
  → active workspace label
```

This is a presentation connection only. Authentication, authorization, routes,
and application workflows remain separate and unchanged.

The welcome region participates only in shell layout: navigation remains above,
the flexible welcome occupies available height, and Active Workspace remains
anchored below. It has no data-flow or authorization connection.

## Final authentication workflow connection

```text
Sign Up → exact server domain rule → users + user_roles
Sign In → bcrypt verification → HTTP-only session
  → canonical public current user
  ├── initial Student/Admin workspace
  ├── sidebar Welcome
  ├── Profile identity
  └── existing authorized application APIs
Logout → revoke session → clear display cache → Sign-In
```

Frontend role presentation cannot grant permissions; middleware, persisted
roles, ownership, and preferred workspace remain authoritative.

Open development registration changes no downstream connection: arbitrary
usernames at the two supported exact domains still use the same bcrypt
credentials, `users`/`user_roles` persistence, server session, canonical
identity, workspace authorization, and protected recovery APIs.

## Database-backed complete recovery connection

```text
users + user_roles + sessions
  → reports + report_images
  → report_matches
  → claims
      ├── claim_history
      ├── claim_admin_notes
      ├── messages
      └── notifications
  → returned/closed report and claim records
```

Numeric foreign keys and backend ownership predicates connect identity to each
workflow. Historical snapshots preserve what was submitted, while canonical
authorization continues to use `users.id`, `user_roles`, sessions, and active
workspace. The database audit changed none of these connections.

Safe logging observes each API boundary without receiving business payloads:

```text
Auth / Reports / Claims / Messages / Notifications
  → safe operation name + numeric IDs/roles/counts
  → bounded error name/code/constraint/severity
  ⛔ no credentials, contact data, verification, notes, messages, SQL details
```

Authorization precedes every protected workflow connection:

```text
HTTP-only session cookie
  → hashed sessions lookup
  → users.id
  → user_roles + preferred_workspace
  → role guard
  → report/claim/conversation/notification ownership predicate
  → existing business transaction
```

Development email domains participate only at the initial signup edge; they do
not participate in any protected request decision.

## Production session-security connection

```text
Browser credentials
  → failure-only IP/email throttle
  → bcrypt verification
  → fresh random session token
  → hashed PostgreSQL session
  → host-only HTTP-only cookie
  → explicit CORS + security headers
  → authentication + role + ownership
  → unchanged reports/claims/messages/notifications workflows
Logout → database revocation + matching cookie clear → protected access 401
```

SameSite=Lax, JSON requests, and explicit credentialed origins form the current
CSRF boundary. They connect only to transport security; they do not change
matching, lifecycle transitions, notifications, or workspace authorization.

## Remember Me connection

```text
Sign In checkbox
  → rememberMe boolean
  → server TTL selection (8 hours / 30 days)
  → existing hashed sessions row + secure cookie
  → unchanged /auth/me identity
  → unchanged Student/Admin workspace and recovery workflows
Logout → revoke same session row → protected access 401
```

Remember Me has no connection to passwords in storage, report content,
matching, claims, messages, or future AI/search logic beyond supplying the same
authenticated identity those existing features already require.

## AI description-quality connection

```text
Lost/Found Report Item description
  → optional authenticated + rate-limited improvement request
  → description-only provider boundary
  → validated suggestion
  → Original / Suggested user review
  ├── Keep Original
  ├── Edit Suggestion
  └── Use Suggestion
  → ordinary report submission
  → reports.description
  → unchanged matching description overlap
```

AI does not connect to claims, ownership verification, Admin Notes, messages,
hidden Found evidence, sessions, or database reads. It improves writing quality
only and does not determine ownership or truth.

## Smart Search connection

```text
Authenticated Student/Admin workspace
  → existing Dashboard search input
  → GET /reports/search?q=natural language
  → server-authorized report candidates
  → deterministic query parser and ranker
  → relevance score + field evidence
  → existing report card/details
  → existing claim/report workflow (unchanged)
```

Smart Search reads the final report text already produced by ordinary reporting
or the optional user-approved description assistant. It does not call that AI
provider. Search also does not create `report_matches`, notifications, claims,
or lifecycle transitions; it only retrieves authorized reports. Selecting an
active Found result reconnects to the existing Claim This Item path. Student
search excludes non-owned private historical inventory and blanks reporter
contact fields, while Admin search can retrieve all retained report states.

## Reliable application entry connection

```text
Sign In / Refresh
  -> bounded server session restoration
  -> server-authorized workspace
  -> coalesced Dashboard initialization
  -> reports + claims settle independently
  -> metrics, report directory, and actions render
  -> existing report -> match -> claim -> return workflow
```

This changes only when and how first authorized data renders. It does not
bypass authentication, merge role scopes, or alter matching, claims, messages,
notifications, approval, return, or closure.
