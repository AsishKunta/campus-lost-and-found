# To the Next Engineer

> **Current handoff:** Phase 4 and the preceding UX stabilization sprint are
> implemented and verified. Do not restore standalone Admin/Profile runtime
> pages, role-membership-only authorization, or ad hoc claim transitions.
> Wait for owner approval before beginning another milestone.

> The Phase 4 workflow refinement is also complete: preserve the Found-only
> Student Dashboard, dedicated My Reports/My Claims and Admin Lost/Found
> modules, migration 005 multi-photo model, and optional related Lost Report
> on a direct Found-item claim.
> Phase 4.1 consolidated report entry into one Report Item form. Preserve the
> explicit empty-by-default selector. Both authenticated workspaces may submit
> either report type; do not recreate separate Lost and Found form pages.
> The Phase 4 regression completion restored eligible Claim This Item actions
> and added New Claim as a second entry into the same claim form. Preserve My
> Claims as tracking and migration 006 manual-claim context.
> Routing is consolidated: `dashboard.html` is the only active shell. Preserve
> hash navigation, History-state route parameters, and compatibility redirects.
> Do not link active features to standalone `.html` pages.
>
> Authentication is integrated. Preserve the HTTP-only session gate, canonical
> current-user cache, server/database authorization, exact development-domain
> signup rules, Profile/sidebar identity consistency, and logout cleanup.
>
> Preserve the unified green palette and 272px desktop sidebar. The welcome
> block now renders the authenticated profile name and workspace from the same
> session-backed identity source.
>
> Phase 6 Step 3 is complete. Preserve production `__Host-` secure-cookie
> defaults, explicit expiry, auth `no-store`, global security headers,
> fail-closed production CORS, exact proxy trust, and failure-only login
> throttling. Do not deploy multiple API instances until throttling uses a
> shared/edge store. Do not enable `SameSite=None` without explicit CSRF
> protection. Full suite: 110 tests.
>
> Phase 6 Step 4A is complete. Preserve the server-owned eight-hour/30-day TTL
> choice, boolean-only `rememberMe`, unchanged secure cookie/session/logout
> path, and zero credential storage. Step 4B builds on this without changing it;
> 4C smart search/ranking and email work still require owner approval.
>
> Phase 6 Step 4B is complete. Preserve the report-description-only scope,
> authenticated/rate-limited server provider boundary, description-only privacy
> contract, no-content logging, reversible preview, explicit acceptance, and
> non-blocking provider failure. Full suite: 125 tests. Do not extend AI to
> verification/evidence. Phase 6 Smart Search is now complete: preserve the
> authenticated role-scoped endpoint, deterministic service, honest relevance
> labels, field evidence, historical Admin retrieval, Student privacy scope,
> and separation from automatic report matching. Email remains deferred.
>
> Matching direction was corrected after manual workflow verification. Only a
> new Lost Report initiates matching; only existing active Found Reports are
> candidates. Found creation persists inventory and returns to Dashboard with
> no immediate Potential Matches screen. Preserve this direction and the
> unchanged scoring algorithm.

Welcome to Campus Lost & Found.

You are inheriting an ambitious portfolio application with a useful product
idea, a broad prototype feature set, and one recently completed portfolio-grade
milestone. The project is not production-ready, and it should not be treated as
if every screen is equally mature.

Read, in order:

1. `README.md`
2. `PROJECT_STATE.md`
3. `PROJECT_HANDOFF.md`
4. `ARCHITECTURE.md`
5. `DEVELOPMENT_POLICY.md`

This document tells you how to proceed without losing the strongest work.

---

## What has already been completed

The original application already supported:

- Account signup and credential verification
- Report submission
- Report dashboard, search, and filters
- Images
- Claims
- Admin review
- Messages
- Profile display
- A rule-based matching concept

The latest completed milestone transformed matching into the product's central
experience:

- The backend is the only source of matching rules.
- Lost reports compare only with Found reports.
- Found reports compare only with Lost reports.
- Reports cannot match themselves.
- Report Type and Item Category are separate.
- Each candidate has an explicit Match Score and evidence list.
- The user sees matches immediately after report creation.
- The UI compares reports side by side.
- The UI supports view, claim/verify, dismiss, and return actions.
- Match Score is explicitly not presented as probability.
- The experience is responsive and has important accessibility semantics.
- Five focused tests protect the matching behavior.

This work is the current signature feature. Preserve it.

---

## What should not be changed without good reason

### 1. One backend matching implementation

Do not reintroduce matching in the browser. UI code should render results, not
independently calculate them.

### 2. Complementary report eligibility

Lost-to-Lost and Found-to-Found matches are invalid for the current product
model. Eligibility must be enforced before scoring.

### 3. Self-match exclusion

The SQL query and pure service both exclude the new report. Retaining
service-level protection is intentional defense in depth.

### 4. Match Score language

Do not call Match Score:

- AI confidence
- Probability
- Percentage likelihood

The score has not been statistically calibrated. If a later milestone creates
a labeled dataset and calibration, document the evaluation before changing the
language.

### 5. Structured score evidence

The API returns `matchEvidence`. Keep the result explainable. Any new matching
signal must define:

- Key
- User-facing label
- Points or contribution
- Optional explanation

### 6. Separation of report type and item category

The database column `category` is unfortunately the report type for historical
reasons. The UI correctly calls it Report Type, and `item_category` is the item
taxonomy. Do not collapse these concepts again.

### 7. Pure matching service

Keep matching functions independent of Express and PostgreSQL. This is why they
are easy to test.

### 8. Project scope

Work only in `Campus-Lost-and-Found-Codex`. Do not modify the original project.

---

## Common mistakes to avoid

### Mistaking browser state for authentication

`localStorage.role` and `sessionEmail` are not trusted identity. Browser route
guards are not authorization.

### Assuming all messaging features work

Primary real-time and unread functions are stubs. The legacy page uses direct
Supabase access. Do not build on both paths.

### Editing an applied migration

The migration system is complete. Never edit an applied SQL file. Add the next
ordered migration and run `npm run migrate`. The API will reject pending or
checksum-mismatched migrations.

### Approving claims with separate queries

The current workflow can race. Do not add more approval side effects until the
workflow is transactional.

### Adding AI before evaluation

The deterministic matcher is a baseline. If you add embeddings or image
analysis, first create labeled examples and metrics. “Uses AI” is not a
portfolio differentiator by itself.

### Rewriting the frontend prematurely

There is meaningful technical debt, but a framework rewrite without tests
could erase working behavior. Stabilize contracts and critical workflows first.

### Bypassing the active workspace

A dual-role user is not simultaneously authorized as Student and Admin.
`preferredWorkspace` is the active backend authorization context; `roles` only
lists the workspaces the account may select.

### Exposing reporter details

Current report DTOs include email and phone. A professional version should
separate public discovery data from private administrative/owner data.

### Duplicating status concepts

The project already has `status` and `claim_status`. Do not add more status
fields before defining one lifecycle model.

### Trusting stale comments

Some comments still refer to Supabase or planned unread columns. Verify behavior
in code and schema.

---

## Important design decisions

### Matching is deterministic and explainable

The current model intentionally favors transparency. It is appropriate for the
portfolio narrative because a reviewer can inspect the rules and tests.

### Matching happens synchronously after insert

This is acceptable for the current dataset. Optimize only after adding SQL
candidate pre-filtering or measuring latency.

### The first upgrade avoided a framework rewrite

The objective was to demonstrate strong product improvement while preserving
the inherited system. Future modernization should be incremental.

### Local and remote PostgreSQL are supported

Local URLs disable SSL; remote URLs enable it. Preserve this behavior when
introducing a configuration module.

### Claims may be standalone

The inherited model permits null `report_id`. This preserves old behavior, but
the strongest future workflow should encourage claims that originate from a
specific match/report.

---

## Remaining priorities

### Completed priority: authorization

Secure server-issued sessions, normalized database roles, ownership policies,
and administrator-only actions are complete.

### Completed priority: transactional claim workflow

Transactions, row locking, selective related-claim closure, and database
competing-approval defense are complete.

### Priority 3: API privacy

Create public and private DTOs. Public match/report results should not expose
reporter contact details or private ownership evidence.

### Priority 4: tests

The migration foundation is complete. Add API integration tests before
consolidating large areas of frontend code.

### Priority 5: frontend consolidation

Remove legacy page duplication after critical workflows are protected by
broader browser/API tests.

---

## Recommended next milestone

The **Trusted Identity and Transactional Recovery Workflow** vertical milestone
is complete.

### Required outcome

An authenticated student creates a report. Another authenticated student
submits a claim. Only an authenticated administrator can approve it. A second
approval cannot win the same item. Public users cannot see private reporter or
claim data. Conversation access is restricted to the claimant and
administrators.

### Recommended implementation order

1. Preserve the completed migrations and secure session authentication.
2. Define canonical report and claim lifecycle states.
3. Add authorization policies for student/admin resources.
4. Backfill or define compatibility behavior for historical ownership.
5. Define public/private report DTOs.
6. Restrict claim and conversation access by authenticated participation.
7. Implement claim approval as a transaction with row locks.
8. Add integration tests for all success and denial paths.
9. Update UI authorization and conflict states.
10. Update all handoff documents.

Do not declare the milestone complete with authentication alone. The value is
the entire trusted recovery flow.

### Phase 3 finalized authorization and recovery rules

These rules are the implemented Phase 3 contract and must remain regression
invariants.

#### Matching and notifications

- Creating a Lost report must run the matching engine immediately.
- If eligible matches exist, notify the student immediately. Otherwise keep the
  Lost report active without requiring manual rechecks.
- Superseded: creating a new Found report no longer initiates matching; it
  becomes active candidate inventory for a future Lost Report submission.
- Matching must consider item name, category, residence hall/building, incident
  date, and description keywords, return only the highest-scoring candidates,
  and exclude returned items, closed items, and archived reports.
- Notification delivery must be durable and idempotent so the same match event
  does not repeatedly notify the same student.

#### Claim limits, cancellation, and expiration

- A Lost report may have at most three active claims. This limit is scoped to
  the Lost report, not to the student account.
- A rejected, cancelled, expired, or otherwise closed claim no longer consumes
  one of the three slots.
- A student may cancel a claim only before administrator review. The
  confirmation dialog must use:
  - Title: `Cancel Claim?`
  - Message: `Cancelling this claim removes only this claim. Your Lost Report
    remains active and you may claim another matching item later.`
  - Actions: `Keep Claim` and `Cancel Claim`
- Claims expire after 60 days without administrator action. The duration must
  be configurable. Expiration closes the claim and notifies the student.

#### Lost-report closure

- A student may close their own Lost report after finding the item independently
  or choosing to stop the search.
- Closure must not delete the report. It records the terminal state `Closed by
  Student`, cancels all pending claims, stops future matching, and preserves
  history.
- The confirmation dialog must use:
  - Title: `Close Lost Report?`
  - Message: `Closing this report will cancel all pending claims and stop future
    matching for this Lost Report.`
  - Actions: `Keep Report Open` and `Close Report`

#### Administrator adjudication

- Approval must run transactionally and lock the affected records.
- When one claim is approved, the approval page must detect other active claims
  for the same Lost report and show them as pre-selected closure checkboxes.
  Claims for other Lost reports must not be selected merely because they belong
  to the same student.
- The administrator may uncheck any suggestion. Only explicitly checked related
  claims are closed by the approval transaction; related claims must never
  disappear silently.
- Manual rejection records the reason `Ownership could not be verified.`
- Automatic rejection after return to another verified claimant records the
  reason `This claim was automatically closed because the item has already
  been returned to another verified claimant.`
- The approval page includes optional `Admin Notes`. Notes are internal,
  immutable claim-history data and must never appear in student or public DTOs.

#### Roles and workspace switching

- A single authenticated user may hold both Student and Admin roles.
- Login remains a single session. The server returns the roles available to the
  user, and the UI may switch between Student Space and Admin Space without
  reauthentication.
- Workspace selection is presentation state, never proof of authorization.
  Every backend action must check the session user's assigned roles and resource
  policy.
- Users may save a preferred default workspace in Settings. The preference must
  be stored in PostgreSQL and must reference a role the user currently holds.
- Phase 3 needs a multi-role relationship and preferred-workspace persistence.
  Preserve the current `users.role` column only as a compatibility bridge while
  migrating; do not treat it as the long-term source for multiple roles.

#### Required acceptance coverage

Tests must cover immediate and later matching notifications, eligibility
filtering, the per-report three-active-claim limit and reopened slots,
student-owned cancellation/closure, configurable expiration, both rejection
types, selective related-claim closure, private admin notes, dual-role workspace
switching, preferred workspace validation, and server-side denial of every
unauthorized variant.

---

## Advice for maintaining project quality

### Keep the product story visible

Every milestone should strengthen:

```text
Report → Match → Verify → Review → Return
```

### Prefer demonstrable engineering

A recruiter is more likely to value:

- A transaction that prevents double approval
- A test demonstrating authorization boundaries
- Measured matching precision
- An accessible complete workflow
- A documented architecture decision

than a collection of shallow features.

### Keep documentation honest

Clearly distinguish:

- Implemented
- Partial
- Planned
- Verified

Do not claim real-time messaging, secure authorization, or AI confidence until
they exist. Secure session authentication is complete.

### Preserve portfolio-quality polish

New screens need complete states, responsive behavior, accessibility, and
coherent visual language. Do not leave placeholder buttons.

### Make architecture changes incremental

Create tests around current behavior, migrate one workflow, remove the old
path, and then continue.

### Keep the matching baseline

Even if semantic matching is added, preserve the deterministic baseline for
comparison. An evaluated improvement is much more impressive than an opaque
replacement.

---

## Local startup

```bash
cd backend
npm ci
cp .env.example .env
# Update DATABASE_URL
npm run migrate
npm start
```

In another terminal:

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/dashboard.html
```

Tests:

```bash
cd backend
npm test
```

---

## Final note

After explicit approval, the next milestone should add isolated PostgreSQL
HTTP integration/CI coverage and a dedicated Admin archive view. Preserve all
Phase 1–4 migrations and security/lifecycle behavior. Never edit applied
migrations 001–006; add migration 007 or later for schema evolution. Read
`DATABASE_ARCHITECTURE.md` before Phase 6 database work.

This repository has the ingredients of a memorable portfolio project, but the
strongest path is disciplined depth rather than feature volume.

Protect the matching experience, establish trustworthy workflow invariants,
measure future intelligence features, and finish every milestone as if a senior
engineer will review both the product and the tradeoffs.

## Post–Phase 4 UI/UX modernization guardrails

The modernization is complete and is not Phase 5. Continue from the existing
shared-shell architecture:

- Treat `css/modern.css` tokens and responsive container rules as the current
  visual source of truth.
- Do not remove or rename dashboard IDs/classes/data attributes without
  repository-wide selector analysis and regression updates.
- Do not restore permanent dashboard filter-button rows or fake trend values.
- Keep Student and Admin metrics tied to existing authorized API responses.
- Preserve the compact report-card hierarchy and operational Claim Requests
  list; keep the My Claims timeline structure.
- Verify 390, 768, and 1440 widths, keyboard focus, Back/refresh, and console
  output after frontend changes.
- Phase 4 state transitions and API contracts remain frozen.

Phase 6 Steps 1–3 are complete. Route all new backend runtime logging through
`backend/utils/safeLogger.js`; never emit bodies, credentials, verification,
private notes, message text, SQL parameters/details, or stacks.

Preserve the server authorization chain: session → `users.id` → persisted
`user_roles` → assigned active workspace → ownership predicate. Development
email domains are registration conventions only and never request-time proof.

Preserve the Step 3 session boundary: production host-only secure cookies,
explicit expiry, auth no-cache, global security headers, fail-closed production
CORS, exact proxy trust, and login throttling. The limiter is process-local;
replace it before multi-instance production. SameSite=None requires explicit
CSRF protection first.

Current suite: 139 passed, 0 failed. Steps 4A–4B and the deterministic Smart
Search Engine are complete. Do not add semantic/vector/external-AI search or
email notifications without explicit approval.

The final pre-demo stability audit is complete. Current suite: **154 passed,
0 failed**. Preserve bounded `authReady`, coalesced Dashboard load promises,
independent report/claim settlement, and terminal retry/cached-warning states.
Real HTTP first-login and refresh checks passed for Student and Admin. Local
endpoint timings were normal (about 2–10 ms; Dashboard SQL 0.106 ms), so no
index or broader performance refactor was justified. Re-measure before acting
on the documented notification/match-loop growth risks.
