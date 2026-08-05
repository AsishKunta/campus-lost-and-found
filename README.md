# Campus Lost & Found

An explainable campus recovery platform that connects complementary Lost and
Found reports, shows why they may match, and guides users into a claim and
administrator-review workflow.

> Current status: Trusted Identity and Transactional Recovery Workflow
> Phases 1–4 complete. The application now has migrations, secure sessions,
> server-enforced multi-role authorization, durable matching notifications,
> and an end-to-end transactional recovery lifecycle through item return.

> **Phase 4 workflow refinement:** Student Dashboard discovery now contains
> Found Reports only, personalized matches rank first, students track Lost
> Reports and claims in dedicated modules, and both workspaces use one shared
> Report Item form with an explicit Lost/Found selector.

> **Stabilization status:** Student and Admin modules now run in one shared
> `dashboard.html` shell. Legacy Admin/Profile entry points redirect into that
> shell, workspace changes refresh role-specific data without a page reload,
> and matched claims retain both the Lost and Found report relationships needed
> for immediate Admin review.

> **Post–Phase 4 UI/UX modernization:** The shared shell now uses one restrained
> campus-operations design system across Student and Admin workspaces. Dashboard
> metrics are calculated from live report/claim responses, discovery uses a
> compact Search + Filters + Sort toolbar, report cards are denser, Claim
> Requests is an operational review queue, and layouts are verified from 390px
> mobile through 1440px desktop. This work is not Phase 5 and did not change
> Phase 4 workflow or API behavior.

> **Development authentication integration:** `login.html` now creates and
> restores real HTTP-only server sessions before entering the existing shared
> dashboard. Exact `@student.com` and `@admin.com` domains assign one persisted
> development role during signup; malformed suffixes are rejected in both UI
> and API. This convention is disabled in production, where database-assigned
> institutional roles must remain authoritative.

Development registration accepts any valid username at either exact domain;
there is no username whitelist. Duplicate emails remain prohibited, and every
account must authenticate with its own bcrypt-protected password.

> **Phase 6 Step 1 logging hardening:** Backend runtime logs use operation
> names and limited identifiers/counts. Request bodies, credential material,
> contact data, verification evidence, Admin Notes, message contents, SQL
> details, and stack traces are not emitted by application controllers.

> **Phase 6 Step 2 authorization verification:** All protected endpoints resolve
> identity from an active server session, persisted `user_roles`, assigned
> workspace, and numeric ownership. Direct Student-to-Admin requests and
> browser-controlled role/workspace/header tampering are rejected server-side.

> **Phase 6 Step 3 session hardening:** Production sessions now default to a
> host-only `__Host-campus_session` cookie with `Secure`, `HttpOnly`,
> `SameSite=Lax`, `/` path, and explicit expiry. Auth responses are not cached,
> production CORS fails closed without an explicit allowlist, baseline security
> headers are applied globally, and repeated failed logins are temporarily
> throttled. No authentication architecture or recovery workflow changed.

> **Phase 6 Step 4A Remember Me:** Sign In now offers an optional Remember me
> checkbox. The server retains the normal eight-hour lifetime when unchecked
> and selects a 30-day lifetime when checked; both use the same hashed
> PostgreSQL session, secure cookie, expiration, authorization, and logout
> path. Step 4B is documented below; deterministic Smart Search is now
> complete, while email remains deferred.

> **Phase 6 Step 4B AI-assisted descriptions:** The unified Lost/Found Report
> Item form now offers optional, reversible writing assistance. An authenticated
> rate-limited backend sends only the description to a disabled-by-default
> provider abstraction, validates returned text, and presents Original versus
> Suggested copy for explicit Use, Edit, or Keep Original choice. AI never
> saves automatically, verifies ownership, or determines truth. Smart Search
> remains architecturally separate, and email remains deferred.

> **Phase 6 Smart Search Engine:** Student and Admin dashboards now send
> non-empty natural-language searches to one authenticated, deterministic
> backend ranking service. It combines normalized field overlap, controlled
> synonyms, bounded edit-distance typo tolerance, report intent, category,
> color/brand clues, location, lifecycle, and common date phrases. Results show
> an honest relevance score and contributing evidence; no external AI, vector
> service, schema change, or hidden ownership data is involved.

> **Main application visual consistency:** The shared Student/Admin shell now
> uses the same restrained green palette as the isolated authentication UI. Its
> desktop sidebar is 272px wide and includes a role-aware welcome treatment
> sourced from the authenticated session/profile. No recovery workflow changed.

> **Sidebar welcome refinement:** The welcome treatment now uses the flexible
> vertical space between navigation and the anchored workspace selector, with a
> user icon, hierarchy, divider, and recovery tagline. Short-height and mobile
> layouts reduce or remove it without introducing sidebar overflow.

## Why this project is different

Most lost-and-found student projects stop at CRUD. This application includes:

- Immediate active-Found matching after Lost Report submission
- Transparent Match Score evidence
- Side-by-side Lost/Found comparison
- Claim and administrator-review workflows
- Claim-specific messaging
- Separate student and administrator product experiences
- A PostgreSQL-backed relational model

The product vision is:

```text
Report → Match → Verify → Review → Approve → Return
```

## Current matching experience

After a Lost Report is created, the backend returns ranked eligible active
Found Reports. A new Found Report is saved as future candidate inventory and
does not initiate or display the Student Potential Matches experience.

| Evidence | Match Score contribution |
| --- | ---: |
| Same item category | +25 |
| Similar item name | +25 |
| Similar location | +20 |
| Similar description | +15 |
| Same report date | +15 |
| Report date within three days | +10 |

Candidates below 30 points are excluded.

**Match Score is a deterministic evidence-ranking score. It is not an AI
confidence value, percentage likelihood, or calibrated probability.**

The matching implementation lives only in:

```text
backend/services/reportMatchingService.js
```

## Features

### Reports

- Lost and Found report submission
- Separate report type and item category
- Location, date, contact, description, and up to five optional photos
- Dashboard cards and detail view
- Search, type/category filters, and status filters
- Loading skeletons, empty states, and caching
- Student-only My Reports workflow with derived Submitted, Under Review,
  Potential Match Found, Waiting for Student, Recovered, and Closed states
- Administrator Student Lost Reports search/filter workspace
- Unified Student/Admin Report Item form with explicit Lost/Found selection
- Student or Administrator Lost/Found submission with up to five photos
- Found-only Student Dashboard ordered by personal Match Score relevance

### Matching

- Lost-initiated, active-Found candidate eligibility
- Self-match prevention
- Ranked Match Score
- Structured evidence explanations
- Side-by-side comparison
- View, dismiss, claim/verify, and dashboard actions
- Responsive and accessible result presentation

### Smart Search

- Natural sentences or short keywords through the existing dashboard input
- Shared `GET /reports/search?q=...` endpoint with server-derived workspace scope
- Controlled campus lost-and-found synonyms and conservative typo tolerance
- Relative dates from today through last year, rolling windows, and month names
- Normalized relevance labels from Weak through Very Strong Match
- Per-result field evidence explaining item, description, location, category,
  color, brand, date, report type, and active-status contributions
- Student scope: active Found inventory plus the authenticated student's own
  retained reports; Admin scope: all retained reports
- Empty input preserves the existing default dashboard discovery behavior

### Claims and administration

- Suggested-match claims linked to both Lost and Found reports
- Separate New Claim entry for report-independent submission, reusing the same
  claim form, controller, timeline, notifications, and Admin queue
- Student ID, email, description, and evidence image
- Three active claims per Lost Report
- Pre-review student cancellation and non-destructive report closure
- Configurable 60-day claim expiration
- Administrator-only transactional approval/rejection
- Related-claim closure suggestions with administrator control
- Private Admin Notes and immutable claim history
- Smart Dashboard-to-claim handoff with server-trusted student identity
- Action Required re-verification that updates the same versioned claim
- Required rejection explanations, physical return, closure, and archival
- Shared Student/Admin timeline and status-change notifications

### Notifications

- Durable notification records
- Automatic notification when a Lost/Found match is discovered
- Automatic claim-expiration and related-claim closure notices
- Student ownership-scoped notification list and mark-read action
- Administrator view across notification records

### Messaging

- Claim conversation lists
- Student/admin message history
- New message submission
- Latest-message summaries

Real-time subscriptions and persistent unread state are not yet complete.

### Accounts

- Signup
- bcrypt password hashing with 12 salt rounds
- Secure credential verification
- Opaque server-managed sessions stored as SHA-256 token hashes
- HTTP-only SameSite cookies
- Session expiration and logout revocation
- Authenticated `/auth/me` identity
- Basic profile display

Authentication and authorization are server-trusted. Accounts have normalized
Student/Admin role assignments, may hold both roles, and store a validated
preferred workspace. Browser workspace selection never grants permissions.

## Architecture

For the complete current PostgreSQL table map, integrity assessment, migration
health, legacy classification, and Phase 6 readiness boundary, see
[`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md).

```text
Static HTML/CSS/JavaScript frontend
               │
               │ JSON and multipart HTTP
               ▼
        Node.js / Express API
               │
               ▼
           PostgreSQL
```

Uploaded files currently use `backend/uploads`.

For complete architecture and current limitations, read:

- [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)
- [`PROJECT_STATE.md`](PROJECT_STATE.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`DEVELOPMENT_POLICY.md`](DEVELOPMENT_POLICY.md)
- [`NEXT_ENGINEER.md`](NEXT_ENGINEER.md)

## Technology

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API and FormData
- Font Awesome
- Shared design tokens and responsive component rules in `css/modern.css`

### Backend

- Node.js
- Express 5
- PostgreSQL through `pg`
- Multer
- bcrypt
- Node test runner

## Repository structure

```text
.
├── dashboard.html
├── login.html
├── report.html
├── claim.html
├── css/
├── js/
├── assets/
├── backend/
│   ├── controllers/
│   ├── migrations/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── test/
│   ├── db.js
│   └── server.js
└── engineering documentation
```

`dashboard.html` is the main application shell. Legacy Admin/Profile and older
report, claim, claims, messages, notifications, match, and detail URLs remain as compatibility
entry points but immediately redirect into the shared shell. Active navigation
never links from one feature to a standalone HTML document.

## Local setup

### Requirements

- Node.js
- npm
- PostgreSQL
- A static file server, such as Python's built-in HTTP server

### 1. Configure the backend

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `backend/.env`:

```dotenv
DATABASE_URL=postgresql://username:password@localhost:5432/campus_lost_and_found
PORT=3001
FRONTEND_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
SESSION_TTL_MS=28800000
```

### 2. Apply database migrations

```bash
cd backend
npm run migrate
```

Migration status can be inspected with:

```bash
npm run migrate:status
```

### 3. Start the backend

```bash
cd backend
npm start
```

Expected default address:

```text
http://localhost:3001
```

The server never creates or alters application tables. It verifies that all
ordered SQL migrations are applied and refuses to start when the database is
behind.

### 4. Start the frontend

From the repository root:

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/dashboard.html
```

The frontend currently expects the API at `http://localhost:3001`.

#### VS Code Live Server

Open `Campus-Lost-and-Found-Codex.code-workspace` (recommended), or open the
`Campus-Lost-and-Found-Codex` folder itself in VS Code, before starting Live
Server. The checked-in workspace settings pin the static document root to this
repository and port 5500. Then open:

```text
http://127.0.0.1:5500/dashboard.html
```

Do not start Live Server from the parent `CodeXworkspace` folder. Without the
project workspace configuration, that makes the parent directory the document
root and changes the URL to
`/Campus-Lost-and-Found-Codex/dashboard.html`. Also avoid running another
frontend server on port 5500 at the same time.

## Testing

```bash
cd backend
npm test
```

Current tests cover:

- Complementary Lost/Found matching
- Same-type rejection
- Self-match prevention
- Score and evidence calculation
- Score ordering
- Weak-candidate rejection
- Ordered migration discovery
- Migration filename/version validation
- Applied-migration checksum protection
- Transactional migration application
- Rollback on migration failure
- Registration and bcrypt password storage
- Login success and failure
- Session creation, validation, expiration, and revocation
- HTTP-only cookie configuration
- Authentication middleware, protected routes, logout, and `/auth/me`

Current result:

```text
34 tests passing
```

The suite covers migrations, Phase 2 authentication, Phase 3 authorization
policies, notification ownership/deduplication, expiration, claim capacity,
cancellation policy, related claims, Admin Notes privacy, workspace validation,
rejection reasons, and matching. Broader full-database API and automated browser
coverage remains future work.

## API summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create user |
| `POST` | `/auth/login` | Verify credentials |
| `POST` | `/auth/logout` | Revoke the current session |
| `GET` | `/auth/me` | Return the authenticated user |
| `GET` | `/auth/profile/:email` | Fetch the authenticated user's profile |
| `PATCH` | `/auth/workspace` | Store an assigned preferred workspace |
| `GET` | `/reports` | List own reports, or all reports for admins |
| `GET` | `/reports/discover` | List active Found items with the student's best related Lost report |
| `GET` | `/reports/mine` | List only the authenticated student's Lost Reports with workflow status |
| `GET` | `/reports/student-lost` | Administrator-only Lost Report monitoring list |
| `GET` | `/reports/:id` | Fetch an authorized report |
| `POST` | `/reports` | Create report and return matches |
| `PATCH` | `/reports/:id` | Update legacy report status |
| `GET` | `/reports/:id/matches` | List an owned Lost Report’s potential matches |
| `POST` | `/reports/:id/close` | Close an owned Lost Report |
| `GET` | `/claims` | List own claims, or all claims for admins |
| `POST` | `/claims` | Claim a suggested match |
| `POST` | `/claims/:id/cancel` | Cancel an owned, unreviewed claim |
| `POST` | `/claims/:id/review` | Begin administrator review |
| `POST` | `/claims/:id/request-verification` | Request additional student proof |
| `PATCH` | `/claims/:id/verification` | Resubmit the same Action Required claim |
| `GET` | `/claims/:id/related` | Detect related active claims |
| `POST` | `/claims/:id/decision` | Transactionally approve/reject |
| `POST` | `/claims/:id/return` | Record physical item return |
| `POST` | `/claims/:id/close` | Close and archive a returned case |
| `POST` | `/claims/:id/admin-notes` | Add a private Admin Note |
| `GET` | `/notifications` | List authorized notifications |
| `PATCH` | `/notifications/:id/read` | Mark an owned notification read |
| `GET` | `/messages/conversations` | List conversations |
| `GET` | `/messages/:claim_id` | Fetch messages |
| `POST` | `/messages` | Create message |

All application data endpoints require authentication. The API scopes report,
claim, message, and notification access by database role and ownership.

## Current limitations

- The browser API base is local-development oriented; loopback requests now
  preserve the page hostname so credential cookies remain same-site
- Uploads use local disk
- Real-time messaging and unread state are incomplete
- A production-grade background queue is not yet present; claim expiration is
  processed at startup and hourly in the API process
- Email/push delivery is not implemented; notifications are durable in-app
- No current production deployment is verified

## Recommended next milestone

Phase 4 is complete. Stop for owner review. The recommended next milestone is
a **Professional Integration and CI Foundation**: isolated PostgreSQL HTTP
integration coverage, automated migration/startup checks, and a dedicated
Admin archive surface. Read `NEXT_ENGINEER.md` before starting.

## Development policy

### Local authentication

Start at `http://localhost:4173/login.html` or the equivalent port-5500 URL.
Successful login opens the existing `dashboard.html#dashboard` shell. Direct
dashboard access requires a valid session and otherwise returns to Sign-In.
Keep the frontend and API on the same loopback hostname (`localhost` with
`localhost`, or `127.0.0.1` with `127.0.0.1`) so SameSite cookies persist.

Configuration is documented in `backend/.env.example`. Keep
`DEV_AUTH_BYPASS=false`; `DEMO_DOMAIN_ROLES` is development-only and is forced
off in production.

### Local CORS

The API accepts credentialed local requests from `localhost` and `127.0.0.1`
on ports 4173 and 5500. Express handles `OPTIONS` preflight before body parsing,
authentication, and routes. Production must use an explicit
`FRONTEND_ORIGINS` allowlist; wildcard origins are never used.

Future work must follow `DEVELOPMENT_POLICY.md`.

### Session and production transport policy

Development keeps the localhost-compatible `campus_session` cookie without
`Secure`; production defaults to `__Host-campus_session` and requires HTTPS.
Configure trusted production origins with `FRONTEND_ORIGINS` and set
`TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops when TLS
terminates before Express. Wildcard origins are rejected and production no
longer inherits development origins.

`SESSION_COOKIE_SAME_SITE=lax` is the supported default. Do not enable `none`
without HTTPS and an explicit CSRF control. Login throttling defaults to ten
failed attempts per IP/email pair in fifteen minutes; the current in-process
store is suitable for this single-process application, but a shared store or
gateway limiter is required before horizontally scaled deployment.

Normal sessions use `SESSION_TTL_MS` (default 28,800,000 ms / eight hours).
Remember Me sessions use `REMEMBERED_SESSION_TTL_MS` (default 2,592,000,000 ms /
30 days). The client sends only `rememberMe: true|false`; expiration dates and
durations are always selected by the server.

### Optional AI description assistant

Normal reporting needs no AI configuration. To enable the server-side OpenAI
adapter, set `AI_DESCRIPTION_PROVIDER=openai`, supply `OPENAI_API_KEY`, and
select `AI_DESCRIPTION_MODEL` (the example uses `gpt-5.6-luna`). Never put the
key in frontend files. The authenticated endpoint is
`POST /description-assistant/improve`; it accepts only a report description up
to 5,000 characters and is limited to ten requests per user per 15 minutes by
default. If disabled or unavailable, the original report form remains usable.

In particular:

- Work in complete milestones.
- Preserve the explainable matching invariants.
- Add tests for domain rules.
- Keep documentation current.
- Do not commit, push, merge, publish, or deploy without explicit authorization.

### Pre-demo dashboard reliability

Dashboard session restoration and initial data requests are bounded to ten
seconds. Student report discovery and claim summaries settle independently, so
a delayed optional claim request cannot hold already-available reports behind a
loading skeleton. Student and Admin loaders coalesce concurrent initialization
and always leave loading through success, cached-warning, or retryable-error.

Local HTTP verification remains supported at `http://localhost:5500` and
`http://127.0.0.1:5500`. Use the same hostname for frontend and API during a
browser session so development cookies remain same-site.
