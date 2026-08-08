# Campus Lost & Found — Project Overview

## Purpose

Campus Lost & Found is an explainable campus recovery platform. It connects
complementary Lost and Found reports, explains why reports may match, guides
students through ownership claims, gives administrators a review workflow, and
supports claim-specific communication.

The product journey is:

```text
Report → Match → Verify → Review → Approve → Return
```

## Current status

- **Engineering stage:** Portfolio prototype
- **Current phase:** Phase 4 Admin review overlay cleanup complete,
  awaiting owner review
- **Local auth mode:** Temporarily bypassed for core testing; production fails
  closed and the secure authentication implementation remains intact
- **Latest completed product phase:** Explainable Lost/Found Matching
- **Primary application surface:** `dashboard.html`
- **Deployment status:** Local-development only
- **Production readiness:** Not production-ready

## Architecture

```text
Static HTML/CSS/JavaScript browser client
                  │
                  │ JSON and multipart HTTP
                  ▼
           Node.js / Express API
                  │
                  ▼
              PostgreSQL

Uploaded image path:
Browser → Multer → backend/uploads → /uploads
```

The application is a small modular monolith. Express route modules dispatch to
controllers, which currently combine validation, SQL access, business logic,
response mapping, and logging. The report matcher is the only extracted domain
service.

## Technology

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API and `FormData`
- HTTP-only server session cookie for trusted identity
- Browser `localStorage` only for cached display/navigation state
- Font Awesome

### Backend

- Node.js
- Express 5
- CommonJS
- PostgreSQL through `pg`
- bcrypt
- Multer
- Node test runner

## Core domain concepts

- **Report type:** `Lost` or `Found`
- **Item category:** Electronics, Bags, Clothing, Documents, Accessories,
  Keys, or Other
- **Match Score:** A deterministic evidence-ranking score, not a probability
- **Claim status:** `pending`, `approved`, or `rejected`
- **Report claim state:** Currently stored separately from the legacy report
  `status`, creating overlapping status concepts

## Architectural invariants

1. Matching has one implementation on the backend.
2. Lost reports only match Found reports and vice versa.
3. A report cannot match itself.
4. Match Score is never described as probability or AI confidence.
5. Every score contribution remains explainable.
6. Report type and item category remain separate concepts.
7. Matching functions remain pure and testable.
8. New phases preserve the immediate post-submission match experience.

## Current strengths

- Clear recovery-oriented product story
- Explainable matching instead of opaque suggestions
- Immediate match results after report creation
- Side-by-side comparison and evidence display
- Existing claims, review, and messaging product surfaces
- PostgreSQL relational model
- Focused matcher tests
- Ordered, transactional, checksum-protected database migrations
- Authentication-ready role, session, ownership, constraint, and index schema
- Server-managed authentication with expiration and logout revocation
- Responsive and accessible behavior in the matching experience

## Current risks and limitations

- Local demo-domain provisioning is not a production identity-provider model
- Existing accounts retain their stored roles rather than being reclassified
  from an email address at login
- Legacy direct-Supabase messaging bypasses the API session boundary
- Duplicate and legacy frontend paths remain
- Frontend API discovery is local-development oriented
- Local file uploads have no size or MIME allowlist
- No verified production deployment

## Roadmap

1. Trusted Identity and Transactional Recovery Workflow — Phases 1–3 complete
2. Frontend and API Consolidation
3. Professional Test and Deployment Foundation
4. Complete Communication Experience
5. Privacy-Preserving Ownership Verification
6. Standout Portfolio Features

## Documentation policy

The `Project Updates` directory is the permanent engineering journal. After
every completed phase:

- Update the overview if product scope, architecture, or status changed.
- Update the feature catalog and feature connections.
- Update progress and next objective.
- Append a dated changelog entry.
- Append a concise before/after comparison row.
- Create or complete the applicable file in `Daily Updates`.

The authoritative engineering documents in the repository root remain required
and must be updated according to `DEVELOPMENT_POLICY.md`.

## Post–Phase 4 UI/UX modernization

The product now presents every Student and Admin module inside one restrained,
professional campus-operations shell. A shared token system controls geometry,
typography, colors, controls, cards, feedback, forms, modals, and responsive
behavior. The redesign is presentation-only: Phase 4 business logic,
authorization, APIs, routes, and database remain unchanged.

Found-item discovery now combines prominent search with a compact filter menu,
removable active filters, Clear All, and relevance/date/name sorting. Student
and Admin dashboards show only metrics calculable from existing authorized
report/claim responses. Claim Requests is a full-width operational queue, while
My Claims retains the established lifecycle timeline.

## Isolated Authentication UI / Testing Sprint

The main Student/Admin application remains frozen. A standalone authentication
surface now visually matches the product while testing Sign-In, Sign-Up,
validation, loading, duplicate-account responses, and isolated success states.
Temporary `@student.com` and `@admin.com` labels do not grant permissions or
connect users to the dashboard.

## Main Application Visual Polish

Student and Admin now share the isolated authentication preview's restrained
green visual family. The slightly wider sidebar adds a compact development-user
welcome and active-workspace label while preserving every application workflow
and the authentication separation boundary.
The welcome now expands vertically between intrinsic navigation and the
bottom-anchored workspace selector, using a compact avatar and recovery tagline.

## Final Authentication Integration

Sign-In and Sign-Up now hand off real HTTP-only sessions to the existing shared
application. Exact development domains create persisted single-role accounts;
Profile, header, sidebar, routing, and backend authorization all resolve from
the same session-backed public user. The recovery application itself was not
duplicated or reset.

Development registration has no username whitelist: any syntactically valid
local part is accepted only when the complete final domain is exactly
`student.com` or `admin.com`. Duplicate email and password verification rules
remain intact.

## Phase 6 Database Architecture Preparation

The complete PostgreSQL implementation is now mapped in
`DATABASE_ARCHITECTURE.md`: 13 public tables, migrations 001–007, canonical
identity/role ownership, report/match/claim relationships, lifecycle history,
notifications/messages, constraints, indexes, legacy compatibility, and future
readiness. Live aggregate checks and a fresh database run found no structural
defect requiring a migration, so application data and workflows were left
unchanged.

## Phase 6 Step 1 — Production Logging & Sensitive-Data Hardening

Backend runtime logging now uses a minimal shared safety boundary. Reports,
messages, claims, authentication, notifications, middleware, and server errors
emit operation context and bounded metadata without request bodies, personal
content, credential/session data, verification evidence, Admin Notes, message
text, SQL details, or stacks. Unexpected browser-facing database/workflow errors
are generic. No product workflow, schema, route, or frontend behavior changed.

## Phase 6 Step 2 — Authentication & Authorization Hardening

The 32-route backend matrix confirms protected access is decided from hashed
server sessions, canonical user IDs, persisted normalized roles, assigned
active workspace, and object ownership. Direct Student-to-Admin calls, forged
browser role state, unassigned workspace selection, cross-user claims/reports/
conversations/notifications, and invalid/expired/revoked sessions are rejected.
No implementation vulnerability was demonstrated, so Step 2 added proof and
documentation without rewriting the working authorization architecture.

## Phase 6 Step 3 — Session & Production Security Hardening

The PostgreSQL-backed session model now has production deployment guardrails:
host-only secure-cookie defaults with explicit expiry, matching logout cookie
clearing, no-cache auth responses, global security headers, fail-closed
production CORS, configurable exact proxy trust, and failure-only login
throttling. SameSite=Lax and the same-site JSON/CORS topology remain the current
CSRF defense; cross-site cookies require explicit CSRF protection first. No
database, API contract, authorization rule, UI, or recovery workflow changed.

## Phase 6 Step 4 roadmap

- **4A — Remember Me:** Complete. Normal sessions remain eight hours;
  remembered sessions are 30 days, selected only by the server.
- **4B — AI Description Assistant:** Complete. Optional report-description-only
  writing help uses explicit user review and a protected server provider.
- **4C — Smart Search & Ranking:** Complete as a local deterministic,
  explainable, role-scoped backend search engine.

Email infrastructure and email notifications remain intentionally deferred.

## Phase 6 Smart Search Engine

The shared dashboard search now accepts keywords or natural sentences. One
authenticated backend service recognizes common Lost/Found intent, controlled
item synonyms, conservative spelling mistakes, category/color/brand/location
clues, and relative or month-based dates. It ranks only reports authorized for
the active workspace and explains each relevance score. Admin can retrieve all
retained lifecycle states; Student can discover active Found Reports and search
their own retained reports without receiving contact or private verification
data. The feature uses existing PostgreSQL records and no external AI, vector
database, schema migration, or search service.

## Matching workflow correction

Automatic recovery matching now starts only when a Lost Report is submitted.
The backend selects existing Found Reports with canonical
`lifecycle_status='active'`, applies the unchanged deterministic matcher,
persists qualifying Lost/Found relationships, and returns Potential Matches.
Found submission saves future candidate inventory, returns no immediate
matches, and returns the user to Dashboard. No schema, scoring, claim,
authorization, notification contract, or visual redesign changed.

## Pre-demo stability posture

Dashboard entry now waits for bounded session restoration, coalesces repeated
initialization, fetches reports and claim summaries independently, and always
terminates loading with data, an intentional empty/cached state, or retry.
Student/Admin first entry and refresh were verified through HTTP on both local
origins. Performance is healthy at the current dataset size; no database or API
architecture change was warranted.

## Authentication completion

The application now opens at Sign In, validates protected UI before revealing
it, supports secure email-delivered password reset, and uses backend session
roles as the only authorization authority. New Students see only relevant
activity or an empty state; Admins immediately receive all active Found inventory
from PostgreSQL. Migration 007 is the sole schema addition.
