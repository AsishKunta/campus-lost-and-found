# Campus Lost & Found — Engineering Handoff

## Purpose of this document

This document is the authoritative engineering handoff for the
`Campus-Lost-and-Found-Codex` repository. It is written for a senior engineer
who has no access to the prior development conversation. Read this document,
`PROJECT_STATE.md`, `ARCHITECTURE.md`, `DEVELOPMENT_POLICY.md`, and
`NEXT_ENGINEER.md` before changing the application.

The repository is a portfolio-oriented full-stack application. It should be
improved as a coherent product and engineering case study, not expanded through
unrelated features or rewritten without evidence.

---

## Project overview

Campus Lost & Found is a campus recovery application that connects Lost reports
with complementary Found reports, explains why reports may match, supports
ownership claims, gives administrators a review workflow, and provides
claim-specific messaging.

The principal user journey is:

1. A student or campus community member submits a Lost or Found report.
2. The API stores the report in PostgreSQL.
3. For a new Lost Report only, the matching service compares eligible existing
   active Found Reports. Found creation adds candidate inventory without
   initiating the Student Potential Matches screen.
4. The API returns the new report plus ranked potential matches and evidence.
5. The frontend immediately shows a side-by-side comparison and Match Score.
6. The user may view the candidate, dismiss it, or start a claim.
7. An administrator reviews, requests stronger proof, approves, or rejects.
8. Student re-verification updates the same audited claim when requested.
9. An approved item is marked returned and the case is closed and archived.
10. Student and administrator can exchange messages associated with the claim.

Phase 4 implements this journey as a PostgreSQL-backed state machine. Claim
mutations lock records, validate transitions, update report state, append the
shared timeline, and persist notifications transactionally. Browser identity
fields are display-only; the API derives identity and report facts from the
authenticated session and database.

The Phase 4 refinement makes workspace intent explicit. Student Dashboard is
Found-only discovery; `/reports/discover` ranks items matching the student's
active Lost Reports first but includes every active Found Report. Private Lost
Reports live in Student My Reports and Admin Student Lost Reports. Both
workspaces enter the same Report Item page and explicitly select Lost or Found;
the backend permits either authenticated Student or Admin workspace to create
either type. My Claims owns student claim tracking; New Claim opens the same
claim form without a preselected Found Report for manual item entry.
Migration 005 normalizes up to five report photos while retaining
`reports.image_url` as a compatibility primary image.

Migration 006 adds `claims.item_category`, `claims.item_date`, and
`claims.manual_entry`. Dashboard claims continue to derive item facts from the
database. Manual claims persist validated student-supplied item context while
identity remains session-derived; both paths create the same pending claim,
history event, notifications, Admin queue entry, and lifecycle.

The application currently uses a static HTML/CSS/JavaScript frontend and an
Express/PostgreSQL backend. The main product surface is `dashboard.html`,
which contains the role-aware single-page application sections. Legacy Admin
and Profile files, plus older report/claim/claims/messages entry points, remain
only as compatibility redirects into this shell. Active code must call
`navigate()` with a canonical hash route; it must not open feature `.html`
documents. History state carries route parameters so Back/Forward and refresh
preserve route-specific workflow context.

The active workspace is a backend authorization boundary, not merely a visual
preference. A dual-role user owns both role assignments but exercises only the
permissions of `preferredWorkspace` on each request. Switching workspaces
persists that value, rebuilds navigation, clears report cache, and reloads the
role-appropriate dashboard without navigating to a legacy page.

### Phase 6 Step 3 session-security handoff

The existing session design remains authoritative: login creates a new
256-bit opaque token, only its SHA-256 hash is persisted, middleware rechecks
revocation/expiry and current roles on every request, and logout revokes the
row before clearing the cookie. Production defaults to the host-only
`__Host-campus_session` cookie (`Secure`, `HttpOnly`, `SameSite=None`, path `/`,
explicit lifetime) because Vercel and Render are separate sites; development
retains a non-Secure `SameSite=Lax` localhost cookie.

`backend/config/cors.js` now requires explicit production origins and rejects
wildcards. `securityHeaders.js` runs before CORS/routes, auth responses are
`no-store`, and `loginAttemptLimiter.js` applies failure-only IP/email
throttling. Configure `TRUST_PROXY_HOPS` precisely behind a reverse proxy.
Before scaling to multiple API instances, move throttling to a shared store or
edge gateway. Preserve exact credentialed origin validation and JSON request
handling while the production session cookie is cross-site.
There is no Remember Me or password-change flow; neither was added in Step 3.

### Phase 6 Step 4A Remember Me handoff

Remember Me is now implemented only as server-side TTL selection. Missing or
false `rememberMe` uses `SESSION_TTL_MS` (eight hours by default); true uses
`REMEMBERED_SESSION_TTL_MS` (30 days by default). Non-boolean values return
`INVALID_REMEMBER_ME`. `createSession`, `sessions.expires_at`, cookie creation,
middleware validation, role hydration, and logout revocation remain the same.
No migration or remembered-session column exists or is needed.

Do not store credentials or replace this flow with JWT/localStorage. Step 4B
and deterministic Smart Search are now complete as described below. Email
delivery remains intentionally deferred.

### Phase 6 Step 4B AI-description handoff

`js/description-assistant.js` owns the reversible UI state beside only
`#description`. It calls authenticated `POST /description-assistant/improve`;
the route applies per-user throttling before
`descriptionAssistantController` delegates to `descriptionAssistantService`.
The default provider is disabled. The OpenAI adapter is enabled only by server
environment and uses the Responses endpoint with `store: false`.

Only description text crosses the provider boundary. Never add claim evidence,
ownership verification, messages, Admin Notes, identity, or hidden Found-item
facts. The provider prompt and deterministic validation reduce hallucination
risk, while the original/suggestion preview and explicit user acceptance are
the authoritative safeguard. Provider failure returns safely and does not
affect `POST /reports`. No schema, migration, report controller, or matcher was
changed. Smart Search was implemented separately below; email has not started.

### Phase 6 Smart Search handoff

`GET /reports/search?q=...` is the single authenticated search contract.
`reportSearchService.js` is pure domain logic: it normalizes text, expands a
small controlled synonym map, uses bounded Levenshtein comparison for likely
typos, parses Lost/Found/category/color/brand/date signals, scores authorized
candidates, and returns field-level evidence. Keep this separate from
`reportMatchingService.js`: automatic complementary-report matching persists
recovery relationships, while Smart Search retrieves reports from user text.

The controller owns the privacy boundary. Student workspace candidates are
active Found Reports plus the authenticated user's own reports, with contact
fields blanked; Admin workspace candidates include all retained report states.
The active persisted workspace remains authoritative. Empty input never starts
a global query and the browser restores the existing discovery response.

No migration was added. Candidate selection is capped at 5,000 until real
production measurements justify PostgreSQL text indexes or pagination. The
5,000-candidate pure ranking fixture completes in roughly 1.1 seconds on the
current development machine. Do not call the result a probability, expand the
synonym dictionary speculatively, or expose claim evidence/Admin Notes through
search. Email remains deferred.

### Lost-initiated matching correction

Report creation now has one deliberate direction. `createReport` invokes
matching only when `newReport.category === "Lost"`; candidate SQL requires
`category = 'Found'` and canonical `lifecycle_status = 'active'`.
`persistMatchesAndNotify` repeats those direction checks as defense in depth.
Found creation returns `{ report, matches: [] }`, and `report.js` shows the
ordinary success message then returns to Dashboard instead of mounting
Potential Matches. Do not restore symmetric submission matching unless the
product owner explicitly reverses this decision.

The schema remains canonical: `report_matches.lost_report_id` is Lost and
`found_report_id` is Found. Scoring and evidence remain exclusively in
`reportMatchingService.js`. Lost zero-match creation is a successful 201 and
shows the existing no-match state.

---

## Product vision

The intended product is not merely a CRUD list of lost objects. The portfolio
vision is:

> An intelligent, privacy-aware campus recovery platform that explains likely
> matches, verifies ownership, and guides physical items from report through
> secure return.

The strongest current differentiator is explainable report matching. Future
work should reinforce the complete recovery story:

```text
Report → Match → Verify → Review → Approve → Return
```

Features should be judged by whether they strengthen this journey, demonstrate
engineering maturity, or create meaningful portfolio differentiation.

---

## Problem being solved

Campus lost-and-found activity is usually fragmented across front desks,
social media, campus departments, and informal communication. Users often do
not know where to search, staff lack a unified workflow, and public item
descriptions can reveal enough information for fraudulent ownership claims.

This project aims to provide:

- One searchable source for Lost and Found reports.
- Immediate discovery of plausible complementary reports.
- Transparent matching evidence rather than an unexplained result.
- A guided claim and administrator-review process.
- Communication tied to the claim record.
- A foundation for privacy-preserving verification and physical chain of
  custody.

---

## Technology stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Browser Fetch API
- FormData for report and claim submissions
- FileReader for local image previews
- HTTP-only server session cookie for trusted identity
- Browser `localStorage` only as a display/navigation cache
- Font Awesome through a CDN
- Supabase JavaScript client on a legacy page only

There is no bundler, frontend framework, type checker, or frontend test runner.

### Backend

- Node.js
- Express 5
- CommonJS modules
- `pg` PostgreSQL client
- `bcrypt` for password hashing
- Multer for multipart image uploads
- `cors`
- `dotenv`
- `nodemon` for local development
- Node's built-in test runner

### Database and storage

- PostgreSQL
- Local filesystem upload storage in `backend/uploads`
- Optional remote PostgreSQL through `DATABASE_URL`
- SSL is disabled for localhost connections and enabled with
  `rejectUnauthorized: false` for remote connections

### Deployment configuration

- `vercel.json` routes `/` to `dashboard.html` for static frontend hosting.
- No backend deployment configuration is currently authoritative.
- The frontend API URL remains hardcoded as `http://localhost:3001`.
- No production deployment was verified during the latest milestone.

---

## Folder structure

```text
Campus-Lost-and-Found-Codex/
├── README.md
├── PROJECT_HANDOFF.md
├── PROJECT_STATE.md
├── ARCHITECTURE.md
├── DEVELOPMENT_POLICY.md
├── NEXT_ENGINEER.md
├── package.json
├── vercel.json
├── dashboard.html              Main role-aware application shell
├── login.html                  Login and signup page
├── report.html                 Compatibility redirect to #report
├── claim.html                  Compatibility redirect to #new-claim
├── profile.html                Compatibility redirect to #profile
├── admin-dashboard.html        Compatibility redirect to #dashboard
├── admin-claims.html           Compatibility redirect to #claim-requests
├── admin-messages.html         Compatibility redirect to #conversations
├── student-messages.html       Compatibility redirect to #conversations
├── my-claims.html              Compatibility redirect to #my-claims
├── index.html                  Legacy dashboard entry
├── detail.html                 Legacy report detail page
├── matches.html                Legacy matches page
├── profile-detail.html         Legacy profile detail page
├── assets/
│   ├── no-image.png
│   └── profile.png
├── css/
│   ├── style.css               Main shared stylesheet and match UI
│   └── model.css               Additional modal styling
├── js/
│   ├── common.js               API URL, role redirects, logout, toasts
│   ├── userContext.js          Prototype current-user abstraction
│   ├── router.js               Hash navigation and role dispatch
│   ├── dashboard.js            Student report dashboard
│   ├── admin-dashboard.js      Admin report dashboard
│   ├── report.js               Report form and match-result experience
│   ├── claim.js                Claim form and matched-report handoff
│   ├── admin-claims.js         Admin claim review and embedded chat
│   ├── student-messages.js     Student conversation experience
│   ├── admin-messages.js       Admin conversation experience
│   ├── my-claims.js            Legacy direct-Supabase messaging flow
│   ├── login.js                Signup/login form behavior
│   └── profile.js              Profile and report history
└── backend/
    ├── .env.example
    ├── package.json
    ├── package-lock.json
    ├── db.js                   PostgreSQL pool configuration
    ├── server.js               Express bootstrap and migration readiness
    ├── migrations/             Ordered immutable SQL migrations
    ├── scripts/
    │   └── migrate.js          Migration runner and status/readiness checks
    ├── routes/                 Route declarations
    ├── controllers/            HTTP handling and SQL operations
    ├── middleware/
    │   └── authenticate.js     Cookie parsing and session authentication
    ├── config/
    │   └── auth.js             Cookie name, security mode, and session TTL
    ├── services/
    │   ├── authService.js
    │   └── reportMatchingService.js
    ├── utils/
    │   └── sessionCookie.js
    ├── test/
    │   └── reportMatchingService.test.js
    ├── data/
    │   └── db.json             Unused legacy/mock data
    └── uploads/                Generated local uploads; Git-ignored
```

---

## System architecture

The intended current architecture is:

```text
Browser
  │
  │ HTML/CSS/JavaScript
  │ Fetch + JSON or multipart FormData
  ▼
Express routes
  ▼
Controllers
  ├── validation and response mapping
  ├── SQL through pg Pool
  └── matching service invocation
  ▼
PostgreSQL
```

Uploaded images currently follow:

```text
Browser → multipart request → Multer → backend/uploads → /uploads static route
```

One legacy exception exists: `my-claims.js` creates a Supabase browser client
and accesses the `messages` table directly. This is not the desired
architecture and should be removed during consolidation.

---

## Frontend architecture

### Main application shell

`dashboard.html` is the primary application surface. It contains sections with
the `.spa-page` class for:

- Student/admin dashboard
- Report submission
- Claim submission
- Claim requests
- Conversations

`router.js` implements hash navigation. It:

- Defines role-specific sidebar links.
- Hides inactive `.spa-page` sections.
- Shows the selected section.
- Changes the top-bar title.
- Tracks history using hashes.
- Dispatches dashboard and conversation initialization based on the
  `localStorage` role.

### Shared browser modules

`common.js` currently owns:

- `BASE_URL`
- Credentialed `apiFetch`
- Server-session page guard
- Server logout and browser display-state cleanup
- Role switching and redirect behavior
- Profile-menu behavior
- Toast creation and dismissal

`userContext.js` returns a normalized `{ role, email, id }` display object
cached from server responses. Controllers derive authoritative identity only
from authenticated sessions.

### Report flow

`report.js`:

- Wires the report form.
- Validates required fields in the browser.
- Shows image previews.
- Submits multipart FormData.
- Displays loading and error feedback.
- Receives `{ report, matches }`.
- Hides the form and renders match-result cards.
- Shows the submitted and candidate reports side by side.
- Renders a Match Score evidence breakdown.
- Supports detail expansion, dismissal, claim initiation, and dashboard return.
- Resets the form when returning to the dashboard.

The UI explicitly states that Match Score is not AI confidence or probability.

### Dashboard flow

`dashboard.js`:

- Loads reports from `/reports`.
- Uses a localStorage cache as an immediate display fallback.
- Shows skeleton cards.
- Filters by search, report type, item category, and claim status.
- Displays statistics.
- Opens report details.
- Initiates a claim for a report.

`admin-dashboard.js` provides similar functionality plus claim-review actions.
There is duplication between these modules.

### Claim flow

`claim.js`:

- Accepts an optional report ID from SPA navigation or `?reportId=`.
- Collects student ID, student email, item name, location, description, and an
  optional evidence image.
- Sends multipart FormData to `/claims`.
- Shows loading/success/error behavior.

### Messaging flow

`student-messages.js` and `admin-messages.js`:

- Load conversation summaries from `/messages/conversations`.
- Load messages for a selected claim.
- Render role-specific chat bubbles.
- Send new messages through `/messages`.
- Search conversation lists.

Real-time subscription functions and persistent unread functions are currently
stubs. The user must reload or revisit a conversation to receive updates.

`admin-claims.js` also includes an embedded message panel. This overlaps with
the full admin conversations module.

### Profile flow

`profile.js` loads the current profile by the browser-stored email and filters
all reports by that email. Profile editing changes the browser object only and
does not persist because there is no profile update endpoint.

---

## Backend architecture

### Server bootstrap

`backend/server.js`:

1. Loads `backend/.env`.
2. Creates an Express application.
3. Enables credentialed CORS for configured frontend origins and JSON parsing.
4. Ensures `backend/uploads` exists.
5. Serves `/uploads` statically.
6. Mounts reports, claims, authentication, and messages routes.
7. Connects to PostgreSQL.
8. Verifies that ordered migrations are current and unchanged.
9. Starts listening on `PORT`, defaulting to 3001.

Schema creation and changes no longer occur during application startup.
Operators run `npm run migrate` before starting the API. Pending migrations or
checksum mismatches prevent startup.

### Route/controller organization

Routes declare URL/method mappings and Multer middleware. Controllers currently
combine:

- Request validation
- SQL queries
- Business-state changes
- DTO mapping
- Logging
- HTTP responses

The report matching algorithm is correctly separated into a service. Other
workflows, especially claims, should move toward service-layer transactions.

### Database pool

`backend/db.js`:

- Requires `DATABASE_URL`.
- Disables SSL for localhost, 127.0.0.1, and socket-style local URLs.
- Enables permissive TLS for remote connections.
- Exports a shared `pg.Pool`.

---

## Database schema and relationships

The effective schema is defined by ordered SQL files in `backend/migrations`
and recorded in `schema_migrations`.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `SERIAL` | Primary key |
| `name` | `VARCHAR(255)` | Required |
| `email` | `VARCHAR(255)` | Required and unique |
| `password` | `TEXT` | bcrypt hash |
| `created_at` | `TIMESTAMPTZ` | Defaults to current time |
| `role` | `VARCHAR(20)` | Defaults to `student`; constrained to student/admin for new or changed rows |

The role column is returned through authenticated server sessions. Runtime role
authorization is implemented in Phase 3, and the current administrator presentation
can still be browser-selected.

### `reports`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `SERIAL` | Primary key |
| `item_name` | `TEXT` | Required |
| `category` | `TEXT` | Legacy name; stores report type `Lost` or `Found` |
| `item_category` | `TEXT` | Accessories, Bags, Clothing, Documents, Electronics, Keys, Other |
| `location` | `TEXT` | Required |
| `date_found` | `DATE` | Used for both Lost and Found dates despite name |
| `time_found` | `TEXT` | Optional |
| `name` | `TEXT` | Reporter name |
| `email` | `TEXT` | Reporter email |
| `phone` | `TEXT` | Reporter phone |
| `description` | `TEXT` | Optional description |
| `status` | `TEXT` | Defaults to `Pending`; legacy lifecycle field |
| `claim_status` | `TEXT` | Defaults to `pending`; used by dashboards |
| `image_url` | `TEXT` | Local or remote image location |
| `created_at` | `TIMESTAMPTZ` | Defaults to current time |
| `user_id` | `INTEGER` | Nullable owner FK for future authenticated ownership |

Important: `status` and `claim_status` overlap and can diverge. The column
`category` should eventually be renamed to `report_type`, and `date_found`
should become a neutral name such as `incident_date`.

### `claims`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `SERIAL` | Primary key |
| `report_id` | `INTEGER` | Nullable FK to reports; `ON DELETE SET NULL` |
| `user_id` | `INTEGER` | Nullable FK to users; `ON DELETE SET NULL` |
| `student_id` | `TEXT` | Prototype claimant identity |
| `student_email` | `TEXT` | Prototype claimant identity |
| `item_name` | `TEXT` | Standalone claim item name |
| `location` | `TEXT` | Standalone claim location |
| `description` | `TEXT` | Claim evidence |
| `image_url` | `TEXT` | Optional evidence image |
| `status` | `TEXT` | `pending`, `approved`, or `rejected` |
| `created_at` | `TIMESTAMPTZ` | Defaults to current time |

Claims may exist without a report. This was an explicit compatibility decision,
but the strongest product path is a report-linked verification workflow.

### `messages`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` | Primary key, generated by PostgreSQL |
| `claim_id` | `INTEGER` | Required FK to claims; `ON DELETE CASCADE` |
| `sender_type` | `TEXT` | Legacy duplicate of sender role |
| `sender_role` | `TEXT` | `student` or `admin` by convention |
| `recipient_role` | `TEXT` | `student` or `admin` by convention |
| `sender_id` | `TEXT` | Browser-provided identity string |
| `sender_user_id` | `INTEGER` | Nullable sender FK for future server-derived identity |
| `message` | `TEXT` | Required |
| `created_at` | `TIMESTAMPTZ` | Defaults to current time |

There is no `is_read` or `read_at` column in server-managed schema, although
comments in frontend files refer to unread behavior.

### `sessions`

Stores active and revoked server-managed session records: UUID ID, required
user FK, unique SHA-256 token hash, expiry, created/last-seen times, optional
revocation time, user agent, and IP address. Raw tokens are sent only through
HTTP-only cookies.

### Relationships

```text
users 1 ──── 0..* sessions
users 1 ──── 0..* reports
users 1 ──── 0..* claims
users 1 ──── 0..* messages
reports 1 ── 0..* claims
claims 1 ─── 0..* messages
```

New ownership foreign keys exist but current controllers do not populate them.
Runtime ownership is still inferred from browser-supplied email until the
authentication phase.

---

## APIs and endpoints

Only `POST /auth/signup` and `POST /auth/login` are public. Application data
routes require an authenticated session.
Profiles, report mutations, claims, and messages require authentication.
Role and ownership permissions are not yet enforced.

### Authentication

#### `POST /auth/signup`

Body:

```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "plaintext submitted over transport"
}
```

Behavior:

- Validates presence and basic email format.
- Normalizes email to lowercase.
- Rejects duplicate email.
- Hashes password with bcrypt using 10 salt rounds.
- Returns user fields without the password.

#### `POST /auth/login`

Body contains email and password. The route verifies the bcrypt hash, creates
an expiring server session, stores only the token hash, and sets an HTTP-only
SameSite cookie.

#### `POST /auth/logout`

Revokes the current server session and clears the cookie. It is idempotent.

#### `GET /auth/me`

Requires authentication and returns the session-derived public user and
expiration time.

#### `GET /auth/profile/:email`

Requires authentication and returns the public user only when the requested
email equals the authenticated user's email.

### Reports

#### `GET /reports`

Requires authentication. Admin workspace receives all reports; Student
workspace receives only the authenticated owner's Lost Reports.

#### `GET /reports/discover`

Student-only active Found inventory, privacy-safe and personalized by the best
persisted match to an owned active Lost Report.

#### `GET /reports/mine`

Student-only owned Lost Reports with derived workflow status.

#### `GET /reports/student-lost`

Admin-only Lost Reports from all students with search/filter-ready status data.

#### `GET /reports/:id`

Returns one report or 404.

#### `POST /reports`

Accepts multipart FormData or a body parsed by Express/Multer:

- `itemName`
- `category`: `Lost` or `Found`
- `itemCategory`
- `location`
- `dateFound`
- `timeFound`
- `phone`
- `description`
- `status`
- optional `images` files, up to five
- optional `imageUrl`/`image_url`

Requires authentication, derives owner ID, name, and email from the session,
validates report type and item category, transactionally inserts the report and
ordered images, runs/persists matching and notifications, and returns:

```json
{
  "report": { "...": "created report DTO" },
  "matches": [
    {
      "...": "candidate report DTO",
      "matchScore": 95,
      "matchEvidence": [
        {
          "key": "itemCategory",
          "label": "Same item category",
          "points": 25
        }
      ]
    }
  ]
}
```

#### `PATCH /reports/:id`

Updates the legacy `status` field. Any input other than exact `Claimed` becomes
`Pending`.

### Claims

#### `GET /claims`

Returns all claims joined with report information. The response uses database
snake_case fields and exposes claimant details.

#### `POST /claims`

Accepts multipart form data:

- optional `report_id`
- required `student_id`
- required `item_name`
- required `location`
- required `description`
- optional image

Requires authentication, derives user ID and student email from the session,
and creates a pending claim.

#### `POST /claims/:id/decision`

Accepts `pending`, `approved`, or `rejected`.

When approving a linked claim:

- Reads the report's `claim_status`.
- Rejects approval if it is already `claimed`.
- Updates the claim.
- Updates the report to `claim_status = 'claimed'`.

These queries are not transactional and are vulnerable to concurrent approval
races.

### Messages

#### `GET /messages/conversations`

Query parameters:

- `role=student|admin`
- `email=` required for student view
- `includeAllMessages=true` optionally returns raw normalized messages plus
  summaries

Groups message rows by claim and derives latest-message metadata.

#### `GET /messages/:claim_id`

Requires authentication and returns all messages for a claim in ascending
order. `viewer` is accepted but used only for logging. Claim participation is
not yet authorized.

#### `POST /messages`

Requires authentication and creates a message after verifying the claim
exists. Sender user, email, and role are derived from the server session.
Recipient role remains normalized from the request because authorization is
not part of Phase 2.

---

## Business logic

### Report creation

- Item name, report type, item category, and location are required.
- Report type must be Lost or Found.
- Item category must be one of the server allowlist values.
- Images may be uploaded or provided as a URL.
- A new report is always excluded from its candidate set by both SQL and
  service-level self-ID checking.

### Status behavior

There are two report status concepts:

- `reports.status`, using title case and updated by `/reports/:id`
- `reports.claim_status`, using lowercase and updated by claim approval

Dashboards primarily use `claimStatus`, mapped from `claim_status`.

Claim status is `pending`, `approved`, or `rejected`.

### Data mapping

Reports use a frontend camelCase DTO. Claims and messages primarily return
snake_case. The inconsistency is historical and should be standardized in a
future API-contract milestone.

---

## Matching engine design

The only current matching implementation is
`backend/services/reportMatchingService.js`. Earlier frontend duplicates were
removed deliberately.

### Eligibility rules

A candidate is rejected before scoring if:

- Either report type is invalid.
- Both reports have the same type.
- Both reports have the same ID.

Therefore:

- Lost reports are compared only with Found reports.
- Found reports are compared only with Lost reports.
- The submitted report cannot match itself.

### Tokenization

Text is:

- Converted to lowercase.
- Split on whitespace and common punctuation.
- Filtered to words longer than two characters.
- Filtered against a small stop-word set.

`wordOverlap` is boolean: one shared meaningful token is sufficient to award
that field's full points.

### Score

| Evidence | Points |
| --- | ---: |
| Same item category | 25 |
| Similar item name by word overlap | 25 |
| Similar location by word overlap | 20 |
| Similar description by word overlap | 15 |
| Same date | 15 |
| Date within three days | 10 |

Candidates below 30 points are rejected. Results are sorted descending.

### Interpretation

Match Score is a deterministic ranking score, not:

- A probability
- An AI confidence score
- A statistically calibrated likelihood

Do not relabel it as a percentage without a labeled dataset and calibration.

### Known matching limitations

- Boolean token overlap can over-reward one generic shared word.
- No spelling correction, stemming, synonyms, or structured attribute
  extraction.
- Location is free text.
- Date uses a single field named `date_found` for both report types.
- Matching scans all prior reports after each insertion.
- Dismissed matches are not persisted as feedback.
- No labeled evaluation dataset or precision/recall metrics exist.

---

## Claim workflow

### Student path

1. User opens the general claim form or starts from a match.
2. A report ID is passed through SPA navigation or the `reportId` query
   parameter.
3. The student supplies identifying and ownership details.
4. The form sends a multipart request to `/claims`.
5. The server creates a pending claim.
6. The student can see claims and conversations through the relevant pages.

### Approval path

1. Administrator loads claims.
2. Administrator views claim evidence.
3. Administrator approves or rejects.
4. Approval marks a linked report claimed.

### Important limitation

Approval is not wrapped in a PostgreSQL transaction and does not lock the
report row. Competing approvals can race. Reverting an approved claim also does
not reliably restore report state.

---

## Admin workflow

The admin experience includes:

- Report dashboard and statistics
- Search and filtering
- Pending-claim badges
- Claim detail modal
- Approve/reject actions
- Claim-request page
- Message-student action
- Full conversation page

Authentication is trusted, but permissions are not. A user can select the
administrator UI in browser state, and authenticated admin endpoints do not yet
require `users.role = 'admin'`. Treat the admin experience as a prototype until
authorization is implemented.

---

## Messaging workflow

Messages belong to claims. Both full conversation pages and the admin-claim
detail surface can send messages.

Current flow:

```text
Conversation list
  → select claim
  → GET /messages/:claim_id
  → render bubbles
  → POST /messages
  → reload messages
```

Incomplete features:

- Real-time subscription functions are stubs in the primary student and admin
  modules.
- Unread count and mark-read functions only update local in-memory maps.
- The legacy `my-claims.js` directly accesses Supabase and attempts real-time
  subscriptions, which conflicts with the desired API-only architecture.
- Closed-claim messaging behavior differs between interfaces.

---

## Authentication status

Authentication is complete for Phase 2.

What exists:

- Signup
- Boundary validation and email normalization
- bcrypt password hashing with 12 salt rounds
- Credential verification with generic failure messages
- Opaque random server sessions stored as SHA-256 hashes
- HTTP-only SameSite cookies
- Configurable expiration
- Logout revocation
- Reusable authentication middleware
- `/auth/me`
- Credential-enabled origin allowlist
- Session-derived identities for report, claim, and message writes

What does not exist:

- Authorization middleware
- Resource-ownership checks
- Password reset or verification
- CSRF protection

Do not describe the application as securely authenticated.

---

## Security considerations

Current security posture:

1. Roles and ownership are server-enforced from sessions and database records.
2. Claims derive Student identity from the authenticated principal.
3. Conversations and notifications are ownership/workspace scoped.
4. Uploads enforce size and MIME allowlists, but local storage remains publicly
   served and is not production durable.
5. Unexpected controller errors return generic 5xx responses.
6. Runtime logs exclude request bodies, credentials, contact data,
   verification/Admin Note content, message bodies, SQL details, and stacks.
7. Legacy direct-Supabase messaging remains a separate consolidation concern.

Recommended security direction:

- Add role and resource authorization middleware.
- Scope reports, claims, and conversations by the authenticated principal.
- Define public and private report DTOs.
- Validate payloads with schemas.
- Add upload limits and content validation.
- Replace local storage with managed object storage.
- Remove sensitive debug logging.
- Never disable row-level security as a workaround.

Security should be handled as an enabling professional milestone, not as an
excuse to stop improving product quality.

---

## Testing strategy

### Current automated tests

Node's built-in test runner now covers authentication, migration behavior, and
matching.
`backend/test/authentication.test.js` covers:

- Registration and bcrypt storage
- Login success and failure
- Session creation, hashing, validation, expiration, and revocation
- HTTP-only cookie configuration
- Protected-route middleware
- Logout and `/auth/me`

`backend/test/migrationRunner.test.js` covers:

- Ordered discovery and checksums
- Invalid and duplicate versions
- Applied-file immutability
- Transactional application
- Rollback on failure

`backend/test/reportMatchingService.test.js` covers:

- Complementary Lost-to-Found matching
- Same-type rejection
- Self-match prevention
- Evidence keys and score calculation
- Descending score ordering
- Weak-candidate rejection

Run:

```bash
cd backend
npm test
```

### Current validation performed

The last matching milestone also used:

- `node --check` across frontend and backend JavaScript
- A local PostgreSQL database
- Backend startup verification
- Static frontend HTTP serving
- End-to-end local API creation of complementary reports

The end-to-end check produced a Match Score of 95 with all five evidence
categories.

### Missing test layers

- Controller/API integration tests
- Database transaction tests
- Authentication/authorization tests
- Upload tests
- Frontend unit tests
- Browser end-to-end tests
- Accessibility automation
- Visual regression tests
- Load/performance tests

Future tests should focus on user journeys and state invariants, not merely
line coverage.

---

## Documentation overview

- `README.md`: public project entry point and local setup.
- `PROJECT_HANDOFF.md`: complete product and engineering context.
- `PROJECT_STATE.md`: current status, roadmap, bugs, and next milestone.
- `ARCHITECTURE.md`: component, data-flow, and future architecture details.
- `DEVELOPMENT_POLICY.md`: permanent standards and Definition of Done.
- `NEXT_ENGINEER.md`: direct onboarding instructions and implementation order.

If architecture or project status changes, update these documents within the
same milestone.

---

## Major engineering decisions

### Preserve the existing stack during the first upgrade

The first portfolio milestone deliberately improved the existing
HTML/CSS/JavaScript and Express design rather than replacing it with a
framework. This minimized unrelated rewrite risk and preserved working flows.

### Keep matching on the server

Earlier browser matching implementations were removed. The server is the
single source of matching rules, preventing the UI and API from calculating
different results.

### Use explainable evidence

Every score contribution is returned as structured data. The UI shows the
evidence and explicitly says the score is not a probability.

### Require complementary report types

Lost-to-Lost and Found-to-Found suggestions are rejected before scoring. This
is a business rule, not simply a scoring preference.

### Separate item category from report type

The original field labeled Category contained Lost/Found. The first milestone
added `item_category` and relabeled the existing field as Report Type in the
UI. The database column remains named `category` for compatibility.

### Support local and hosted PostgreSQL

`db.js` disables SSL for local databases and enables it for remote connections.
This fixed local startup without removing remote compatibility.

---

## Important implementation details

- `BASE_URL` is defined globally in `js/common.js`.
- Scripts depend on load order and globals; there is no module bundler.
- The main dashboard includes student and admin page fragments in one HTML
  document.
- `router.js` is loaded last.
- `report.js` runs only inside the shared SPA; `report.html` redirects there.
- Claim initiation passes `{ foundReportId, lostReportId }` through SPA
  navigation and History state preserves that context.
- Report API objects are camelCase; claims/messages are primarily snake_case.
- The report matcher expects camelCase report DTOs.
- `backend/uploads` is created at startup and ignored by Git.
- `backend/data/db.json` is not used by the current backend.
- Existing rows predating the matching milestone may have empty
  `item_category` and therefore cannot receive category points.

---

## Performance considerations

Current scale is suitable only for a small portfolio/demo dataset.

Known issues:

- `GET /reports` returns every row.
- `GET /claims` returns every claim.
- Message histories and conversation aggregation have no pagination.
- Every report submission loads every other report and scores in application
  memory.
- Dashboard caching reduces perceived latency but not server/database work.
- Images are neither resized nor compressed.
- The primary dashboard loads student and admin scripts together.

Recommended progression:

1. Add database indexes on report dates/types/categories/statuses, claim
   report/email/status fields, and message claim/timestamp fields.
2. Add server-side pagination and filtering.
3. Pre-filter matching candidates in SQL by opposite report type, date window,
   and item category.
4. Move heavy matching/notifications to background jobs only after measured
   need.
5. Add image resizing and thumbnail generation.
6. Split legacy/admin code after architecture consolidation.

---

## Accessibility improvements already made

The match experience includes:

- Semantic result sections and article cards
- Accessible names for Match Score
- Screen-reader-only context for icon metadata
- Keyboard-focus styles using `:focus-visible`
- `aria-expanded` and `aria-controls` for match detail disclosure
- `aria-live="polite"` on the result area
- Focus movement to submitted results
- Reduced-motion support
- Responsive stacked comparisons
- Text labels in addition to color

Accessibility remains incomplete across legacy pages and modals. Future work
should include dialog semantics, focus traps, focus restoration, form error
association, active navigation states, contrast verification, and keyboard
testing.

---

## UI/UX philosophy

The product should make complex state feel understandable.

Principles:

- Lead with the recovery journey, not generic dashboard chrome.
- Make system reasoning visible.
- Use Match Score only as an evidence-ranking label.
- Never expose private ownership evidence merely to make a match card richer.
- Provide loading, success, empty, error, and recovery states.
- Keep actions explicit: view, verify, dismiss, return.
- Prefer calm, credible feedback over browser alerts.
- Design mobile layouts as first-class experiences.
- Use consistent components, spacing, language, and status semantics.
- Avoid decorative complexity that does not help recovery.

---

## Known limitations

- Role and resource authorization are implemented.
- Admin presentation is selected from server-returned roles and the persisted
  preferred workspace; backend authorization remains independently enforced.
- Frontend API discovery remains local-development oriented, with loopback
  hostname preservation for SameSite credential-cookie consistency.
- Local filesystem uploads are not durable across many hosting environments.
- Deployments must explicitly run migrations before API startup.
- Claim approval is transactional and uses row locking.
- Report status fields overlap.
- Matching scans all reports.
- Match dismissal is not persisted.
- No match-quality evaluation dataset.
- Real-time and unread messaging are incomplete.
- Profile editing is not persistent.
- Report ownership is inferred by email string.
- Legacy duplicate pages remain; direct Supabase data access has been removed.
- No frontend or API integration test suite.
- Production deployment is not currently verified.

---

## Technical debt

### High priority

- Add role and resource authorization to the trusted identity foundation.
- Consolidate remaining legacy page/API-client duplication.
- Add transactions to claim adjudication; the unique approved-claim database
  constraint is now present.
- Normalize statuses and field names.
- Add deployment-safe configuration.

### Medium priority

- Consolidate legacy pages and duplicate browser logic.
- Introduce a shared API client and DTO normalization.
- Add schema-based request validation.
- Replace local uploads with object storage.
- Complete messaging read state and live updates.
- Add pagination and indexes.

### Lower priority

- Remove inline styles and remaining browser alerts.
- Standardize date formatting and escaping utilities.
- Preserve the small `safeLogger` boundary; adopt a production log transport
  only when deployment requirements justify it.
- Improve profile functionality or remove nonpersistent controls.

---

## Future architectural recommendations

The next architecture should evolve incrementally:

```text
Browser UI
  ↓
Shared frontend API client
  ↓
Express routes
  ↓
Authentication + validation middleware
  ↓
Application services
  ├── report service
  ├── matching service
  ├── claim adjudication service
  ├── messaging service
  └── notification service
  ↓
Repositories / SQL access
  ↓
PostgreSQL + object storage
```

Recommended sequencing:

1. Add environment-based API configuration.
2. Add server-managed sessions and roles.
3. Add resource authorization and public/private DTOs.
4. Move claim approval into a transaction-backed service.
5. Validate or replace compatibility constraints as legacy data is normalized.
6. Consolidate frontend pages and request utilities.
7. Add API and browser tests.
8. Add durable object storage.
9. Complete messaging and notifications.
10. Build privacy-preserving ownership verification.
11. Evaluate and improve matching with labeled data.
12. Add QR-based chain-of-custody and recovery analytics.

Do not introduce microservices. The current domain is best served by a
well-structured modular monolith until scale or organizational boundaries
provide evidence otherwise.

### Approved Phase 3 design constraints

Phase 3 must preserve Phase 2 authentication while adding:

- normalized multi-role assignments, server-enforced role/resource policies,
  and a database-backed preferred workspace;
- event-driven matching and deduplicated student notifications when Lost or
  Found reports are created;
- matching over item name, category, building, date, and description keywords,
  excluding returned, closed, and archived records;
- at most three active claims per Lost report, with capacity restored whenever
  a claim becomes inactive;
- student cancellation before administrator review and non-destructive
  `Closed by Student` report closure;
- configurable 60-day claim expiration with notification;
- transactional approval with row locking and administrator-controlled,
  pre-selected closure suggestions for claims related to the same Lost report;
- explicit manual and automatic rejection outcomes; and
- optional private administrator notes retained in claim history.

Workspace selection is never an authorization credential, and administrator
notes must never enter student/public DTOs. The exact confirmation copy,
rejection reasons, workflow rules, and acceptance coverage are authoritative
in the “Phase 3 finalized authorization and recovery rules” section of
`NEXT_ENGINEER.md`.

### Phase 3 implementation handoff

Phase 3 is complete and awaiting owner review. Its implementation adds:

- normalized `user_roles` and validated `preferred_workspace`;
- backend role middleware and ownership-scoped report, claim, message, and
  notification queries;
- Lost-only student reporting and Found-only administrator reporting;
- durable `report_matches` and deduplicated in-app notifications;
- three active claims per Lost Report and duplicate Found Item claim defense;
- student cancellation before review and non-destructive Lost Report closure;
- configurable 60-day expiration processed at startup and hourly;
- transactional decisions with related-claim selection and exact rejection
  reasons;
- private `claim_admin_notes` and immutable `claim_history`; and
- removal of direct Supabase access from student claim messaging.

Thirty-two automated tests pass. Migration 003 applied successfully, API
startup stayed live, protected endpoints returned 401 without a session, and
browser verification covered signup/login, notifications, role visibility, and
student denial from administrator pages. Phase 4 subsequently added the
complete return lifecycle described above.

### Integrated development authentication mode

Local `.env` sets `DEV_AUTH_BYPASS=false` and `DEMO_DOMAIN_ROLES=true`.
Interactive signup assigns exactly one persisted Student/Admin role from an
exact normalized demo domain. Unsupported/spoofed domains are rejected by UI
and API. Both switches fail closed in production. Restart any older process on
port 3001 before validating configuration changes.

### Local CORS handoff

The allowlist is centralized in `backend/config/cors.js`. Local development
supports `localhost` and `127.0.0.1` on ports 4173 and 5500 with credentials.
Preflight handling is mounted before authentication and routes. Production must
replace the local list with trusted deployment origins.

### Post–Phase 4 frontend modernization handoff

The active frontend remains the single `dashboard.html` hash-routed shell.
`css/modern.css` loads after the compatibility stylesheet and inline legacy
rules, making it the authoritative visual layer. Preserve DOM IDs, route hashes,
and data attributes before changing markup because the Vanilla JavaScript
modules use them directly.

The shell uses a 252px desktop sidebar, 68px header, 1440px maximum content
container, shared spacing/control/radius tokens, and responsive rules at 1100,
768, 560, and 390px. Messages becomes a stacked list/detail layout below 768px.

Dashboard filters use `categoryFilter`, `statusFilter`, `sortReports`,
`filterCount`, and `activeFilterChips`. Student and Admin modules bind the same
controls when their workspace becomes active. Metrics are calculated only from
the report and claim collections already returned by existing APIs. Claim
Requests adds a presentation-only status filter and attention styling; all
transactional actions still call the unchanged Phase 4 endpoints.

`backend/test/uiModernization.test.js` protects design-system loading, real
metrics, removal of fake trends, filter/sort hooks, and the complete Admin action
set. The full suite currently passes 72/72.

### Final authentication integration handoff

`login.html` and `js/login.js` use existing auth endpoints, confirm the returned
database role matches the exact demo domain, cache one canonical public user,
and enter `dashboard.html#dashboard`. `common.js` restores `/auth/me`, rejects
bypass identities, aligns the API hostname with the frontend loopback hostname,
revokes logout, and clears cached identity. Profile reads `/auth/me`; sidebar
reads `getCurrentUser()`. The complete suite passes 88 tests.

### Main application visual consistency handoff

`css/modern.css` now shares the authentication UI's deep green, primary green,
soft surface, border, focus, and shadow family. The desktop sidebar token is
272px (240px below 1100px, full-width below 768px). `dashboard.html` includes a
flexible editorial welcome composition; `router.js` fills it from the same
authenticated current-user context used throughout the shell.

### Phase 6 Step 1 logging handoff

`backend/utils/safeLogger.js` now owns safe operational/error emission.
Report/message payload logs were removed, controllers use bounded error
metadata, and unexpected report/claim failures no longer expose raw database
details to browser clients. `backend/test/loggingPrivacy.test.js` guards these
boundaries. Full suite: 94/94. No schema, API workflow, route, or frontend
behavior changed.

### Phase 6 Step 2 authorization handoff

The full route matrix is in `ARCHITECTURE.md`. Authentication resolves a hashed,
active server session to canonical `users.id`, persisted `user_roles`, and the
assigned active workspace. Role middleware and controller ownership predicates
then authorize access. An isolated real HTTP probe confirmed forged role
headers/query/body values cannot elevate a Student, an unassigned Admin
workspace is rejected, legitimate Student/Admin access succeeds, and logout
causes protected access to return 401. No runtime fix was required. Security
coverage is in `backend/test/authorizationHardening.test.js`; full suite 104/104.

### Phase 6 database-preparation handoff

`DATABASE_ARCHITECTURE.md` is the authoritative current PostgreSQL map and
2026-08-02 readiness audit. The live ledger and repository checksums match for
migrations 001–006; a fresh temporary database applied all six successfully.
No corrective migration was created because aggregate integrity checks found
no critical structural defect. Preserve migrations 001–007 exactly; the next
schema change must be a forward migration numbered 008 or later.

### Pre-demo dashboard lifecycle handoff

`js/common.js` owns `apiFetchWithTimeout`, a ten-second wrapper over the
credentialed fetch helper. `js/dashboard.js` and `js/admin-dashboard.js` own one
in-flight load promise each and use `Promise.allSettled` for report/claim data.
Reports are required; claim summaries may degrade with a visible warning rather
than hiding reports indefinitely. Preserve timeout, coalescing, retry, and
unconditional fresh render coverage in `backend/test/preDemoStability.test.js`.

No current database bottleneck was measured. Monitor the per-recipient Admin
notification loop and per-match persistence loop only as counts grow; do not
batch or add indexes without evidence.

### Authentication/recovery completion handoff

Migration 007 owns `password_reset_tokens`. `passwordResetService` owns token
hash/expiration/consumption, password replacement, and session revocation;
`passwordResetDeliveryService` owns optional Resend delivery. Never return or
log a raw token.

Root routes to `login.html`. `dashboard.html` starts `auth-pending`; only
successful session restoration reveals it. Login caches the canonical backend
user and does not select workspace from email. Student discovery is activity-
scoped; Admin uses protected `/reports/active-found`; caches include user ID.

Apply migration 007 to Supabase. Configure Vercel `BACKEND_API_URL`, Render
`FRONTEND_ORIGINS`, and the documented recovery-email variables before release.
