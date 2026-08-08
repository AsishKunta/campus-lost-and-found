# Campus Lost & Found — Permanent Development Policy

## Phase 3 security baseline

All application data routes must retain authentication plus server-side role
and ownership checks. Browser workspace state is never permission evidence.
For multi-role accounts, assigned roles define workspace availability while
the server-loaded `preferredWorkspace` defines the one active authorization
context; never authorize all assigned roles simultaneously.
Student queries must remain owner-scoped; administrator mutations must retain
explicit Admin-role middleware. Private Admin Notes must never enter
student-facing response models. Claim decisions and multi-record report/claim
closure must remain transactional and auditable.

`DEV_AUTH_BYPASS` is permitted only for isolated local development. It must
remain opt-in, fail closed in production, and use a database-backed identity so
authorization and ownership policies continue to execute.

Temporary `@student.com` and `@admin.com` signup conventions may assign a
development role only on the server, only from an exact normalized domain, and
only when explicitly enabled outside production. Every request must still use
the server session, persisted `user_roles`, ownership, and active workspace;
browser domain checks never authorize access.

## Phase 6 production session baseline

- Keep session tokens random, opaque, and stored only as SHA-256 hashes in the
  database; never log or expose raw tokens.
- Production cookies must remain host-only, `Secure`, `HttpOnly`, path `/`,
  explicitly expiring, and `SameSite=Lax` unless a documented deployment need
  and CSRF control justify another setting.
- Production CORS must fail closed and use an explicit credentialed origin
  allowlist. Wildcard origins are prohibited.
- Preserve global anti-sniffing, frame-denial, referrer, and permissions
  headers, plus `Cache-Control: no-store` on authentication responses.
- Configure proxy trust to the exact deployment topology; never broadly trust
  unverified forwarding headers.
- Retain login throttling. Replace its process-local store with shared/edge
  enforcement before multi-instance deployment.
- A future password-change feature must revoke all active sessions. A future
  cross-site cookie deployment must add explicit CSRF protection first.
- Remember Me may alter only the server-selected session TTL. Keep the normal
  and remembered durations centralized, accept only a boolean request flag,
  and preserve identical token hashing, cookie flags, expiration validation,
  authorization, and logout revocation. Never store remembered credentials.

## AI writing-assistance baseline

- Apply AI writing assistance only to the unified Lost/Found report description
  unless a separately reviewed milestone expands scope.
- AI improves writing quality; it never verifies ownership, determines truth,
  creates evidence, or automatically modifies a report.
- Send only the minimum description text through an authenticated, rate-limited,
  server-side provider boundary. Never expose keys or send user/session/profile,
  claim, message, Admin Note, or verification data.
- Preserve identifying details and uncertainty. Prompt strictly, validate
  outputs, retain the original, label suggestions, and require explicit user
  acceptance. Provider failure must never block ordinary reporting.
- Never log AI input/output content. Provider configuration and secrets remain
  environment-only. Smart search must remain a separate reviewed milestone.

## Smart Search baseline

- Keep interactive report search deterministic, explainable, and separate from
  automatic Lost/Found relationship matching.
- Candidate scope must be derived from the authenticated active workspace and
  ownership predicates on the server; browser filters never grant visibility.
- Never search or return ownership verification, claim evidence, Admin Notes,
  messages, credentials, sessions, or hidden/private fields.
- Treat relevance as an evidence score, not probability. Do not inflate weak
  matches or add signals without representative ranking tests.
- Keep synonyms controlled and typo tolerance conservative. Measure candidate
  count and latency before adding indexes or external search infrastructure.
- Empty search must preserve default product behavior and avoid an unnecessary
  global candidate ranking.

## Matching-direction baseline

- Only creation of a Lost Report initiates automatic matching and the Student
  Potential Matches experience.
- Candidate reports must be existing Found Reports with canonical
  `lifecycle_status = 'active'`. Never use Lost, returned, closed, or archived
  reports as candidates.
- Found creation adds future candidate inventory but must not initiate the
  submitter's match/claim UI.
- Preserve `report_matches.lost_report_id → Lost` and
  `found_report_id → Found`, deterministic scoring, evidence, and thresholds.

## Phase 4 lifecycle baseline

Claim status changes must pass through `claimLifecycleService.js`; controllers
and browser code must not invent parallel transition rules. Each accepted
transition must be atomic with report changes, timeline events, and required
notifications. Student identity and Found Report facts come from the
session/database, never authoritative browser payload fields. Re-verification
updates the existing claim and preserves its history.

## Mission

Transform Campus Lost & Found into an exceptional portfolio application that
demonstrates:

- Senior-level software engineering judgment
- Product thinking
- Clean architecture
- Reliable business workflows
- Excellent, accessible user experience
- Measurable technical outcomes

The objective is not maximum feature count or production complexity. The
objective is a coherent, memorable application that a recruiter or engineer can
understand, run, evaluate, and discuss.

This policy applies to all future work unless the project owner explicitly
changes it.

---

## Working boundaries

- Work only inside `Campus-Lost-and-Found-Codex`.
- Never modify or overwrite the original project.
- Do not copy secrets into source control.
- Do not commit, push, merge, publish, or deploy unless explicitly authorized.
- Preserve working functionality unless a milestone intentionally replaces it
  with a tested alternative.
- Avoid unrelated broad rewrites.

---

## Engineering principles

### 1. Build coherent vertical milestones

A milestone should produce a complete user or engineering outcome. Do not stop
at a controller, half-rendered page, placeholder button, or untested database
change.

Examples of valid milestones:

- Trusted login through authorized claim approval
- Privacy-preserving ownership verification
- Complete messaging with unread state and notification
- Evaluated matching improvement with UI explanation and metrics

### 2. Keep one source of truth

- One implementation per domain rule
- One canonical API contract
- One status model
- One role/identity source
- One data-access path

Do not duplicate business logic between frontend and backend.

### 3. Prefer explicit domain language

Use terms consistently:

- `reportType`: Lost or Found
- `itemCategory`: Electronics, Bags, etc.
- `Match Score`: deterministic evidence score
- `claimStatus`: claim decision state
- `reportLifecycleStatus`: report recovery state

Do not use “AI confidence” unless statistically calibrated.

### 4. Enforce invariants close to the data

Critical rules should exist in application services and database constraints
where practical.

Examples:

- Lost only matches Found.
- A report cannot match itself.
- One report cannot have multiple approved claims.
- Only authorized users can access a conversation.

### 5. Measure before adding complexity

Add caching, queues, semantic matching, or additional services only after
defining the problem and measuring the baseline.

### 6. Optimize for reviewer comprehension

A senior reviewer should be able to determine:

- What the product does
- Why the architecture exists
- Which features are complete
- How to run it
- What was tested
- What tradeoffs remain

Documentation and naming are part of implementation.

---

## Coding standards

### General

- Use clear, domain-oriented names.
- Keep functions focused and small enough to understand.
- Prefer pure functions for domain calculations.
- Avoid hidden side effects.
- Avoid global mutable state when adding new modules.
- Return consistent error shapes.
- Remove dead code and stale comments within the milestone that makes them
  obsolete.
- Do not leave obvious TODOs in completed milestone paths.

### JavaScript

- Use `const` by default and `let` only for reassignment.
- Use strict equality.
- Normalize external input at boundaries.
- Escape or use text nodes for untrusted browser content.
- Avoid inline event handlers in new UI.
- Prefer addEventListener and reusable rendering helpers.
- Do not introduce new browser globals unless required for compatibility and
  documented.
- Keep backend domain logic independent of Express where possible.

### Backend

- Use parameterized SQL only.
- Validate body, params, query, and file metadata.
- Derive identity and roles server-side.
- Use transactions for multi-record state transitions.
- Separate controller, application service, and persistence responsibilities as
  workflows become complex.
- Avoid returning database error details to clients.
- Do not log passwords, tokens, private evidence, messages, or unnecessary PII.
- Add migrations for schema changes.

### Authentication

- Store passwords only as adaptive bcrypt hashes; never log or return hashes.
- Use opaque cryptographically random session tokens.
- Store only a one-way session-token hash in PostgreSQL.
- Send raw session tokens only in HTTP-only cookies.
- Use `SameSite=Lax`, a root path, explicit expiry, and `Secure` in production.
- Derive authenticated identity exclusively from the server session.
- Never accept user ID, email, or sender identity from a browser as
  authoritative.
- Revoke the server session on logout and clear browser identity caches.
- Return generic login failures that do not reveal whether an account exists.
- Keep credentialed CORS origins explicit and environment-configurable.
- Test registration, login denial/success, session expiry, middleware,
  `/auth/me`, and logout for every authentication change.

### Database

- Add explicit foreign keys.
- Add check constraints or enums for controlled states.
- Use neutral and accurate column names.
- Add indexes based on query patterns.
- Keep migrations reversible when practical.
- Never make destructive data changes without a backup or explicit approval.

### Production logging and sensitive data

- Use `backend/utils/safeLogger.js` for backend operational and error events.
- Log operation names and the minimum useful IDs, roles, and counts.
- Never log full request bodies, credential payloads, password/hash/token/cookie
  values, authorization headers, contact data, verification evidence, private
  Admin Notes, message contents, uploaded-file metadata, or SQL parameters.
- Unexpected 5xx responses must be generic; do not return PostgreSQL messages,
  details, hints, codes, or stacks to browser users.
- Preserve actionable debugging through bounded error name, code, constraint,
  and severity metadata rather than raw error serialization.
- Add focused privacy regression coverage when introducing new runtime logs.

### CSS and UI

- Reuse design tokens and shared components.
- Avoid new large inline style blocks.
- Use mobile-first responsive rules.
- Support `:focus-visible`.
- Respect `prefers-reduced-motion`.
- Do not use color as the only state signal.
- Ensure text and interactive controls meet contrast expectations.

---

## Milestone workflow

### 1. Understand

Before changing code:

- Read the relevant handoff and architecture sections.
- Trace the existing user and data flow.
- Identify invariants and compatibility constraints.
- Inspect existing tests and related technical debt.

### 2. Define

Write a concise internal milestone definition:

- User outcome
- Engineering outcome
- In scope
- Out of scope
- Acceptance criteria
- Test strategy
- Migration or compatibility risks

Do not pause for approval if the user already authorized the milestone and
reasonable decisions are available.

### 3. Implement

- Work through the complete vertical slice.
- Include loading, success, empty, error, and recovery states.
- Address related duplication and defects when naturally in scope.
- Keep changes within the selected project.

### 4. Verify

- Run existing tests.
- Add focused tests.
- Exercise the complete user flow.
- Check responsive behavior.
- Check keyboard behavior and accessibility semantics.
- Validate error cases.
- Fix failures before reporting completion.

### 5. Document

Update as appropriate:

- README
- API documentation
- Architecture
- Project state
- Environment examples
- Migration notes
- Manual test instructions

### 6. Report

At milestone completion report:

1. Milestone completed
2. Summary of work
3. Files added
4. Files modified
5. Files removed
6. Tests executed
7. Manual testing steps
8. Bugs fixed
9. Remaining improvements
10. Suggested commit message

---

## UI/UX standards

### Product experience

- Make the recovery journey visible.
- Show users what happened and what to do next.
- Explain system decisions.
- Prefer actionable empty states.
- Preserve user input after recoverable failures.
- Disable duplicate submission while a request is active.
- Confirm destructive or consequential actions.
- Use consistent status language.

### Required states

Every data-driven interface must account for:

- Initial
- Loading
- Success
- Empty
- Validation error
- Network/server error
- Retry or recovery
- Disabled/closed, when applicable

### Accessibility

At minimum:

- Semantic HTML
- Keyboard-operable controls
- Visible focus
- Programmatic labels
- Form error association
- Accessible dialogs with focus management
- Live announcements for asynchronous results
- Contrast-safe status presentation
- Touch targets suitable for mobile
- Reduced-motion support

### Responsive behavior

Verify at:

- Narrow mobile width
- Large mobile/small tablet
- Desktop

Horizontal overflow, clipped modals, inaccessible controls, and tiny tap targets
are release blockers.

---

## Testing expectations

### Required for every milestone

- Run all existing tests.
- Add tests for new domain rules.
- Test failure paths.
- Check regression of adjacent workflows.
- Record commands and results.

### Test hierarchy

Prefer:

1. Pure unit tests for domain logic
2. API integration tests for workflows and authorization
3. Database tests for constraints and transactions
4. Browser tests for critical user journeys
5. Accessibility checks

Avoid tests that only assert implementation details or static strings without
protecting behavior.

### Critical workflows that must eventually be automated

- Signup/login/logout/session expiry
- Student/admin authorization
- Report creation and matching
- Self/same-type match rejection
- Claim submission
- Competing claim approval
- Private data isolation
- Conversation access
- Message send/read state
- Upload validation

---

## Documentation requirements

Documentation is required when changing:

- Architecture
- Schema
- Environment variables
- API contracts
- Business rules
- Local setup
- Deployment
- Test commands
- Known limitations

### Documentation responsibilities

- `README.md`: public entry and setup
- `PROJECT_HANDOFF.md`: stable project context
- `PROJECT_STATE.md`: current status and roadmap
- `ARCHITECTURE.md`: component/data relationships
- `DEVELOPMENT_POLICY.md`: permanent standards
- `NEXT_ENGINEER.md`: onboarding and next steps

Do not allow documentation to claim that partial features are complete.

---

## Refactoring policy

Refactor when:

- It directly supports the milestone.
- Duplicate logic risks inconsistent behavior.
- A workflow cannot be tested cleanly.
- The existing boundary prevents a required invariant.
- Naming obscures the domain.

Do not refactor when:

- The change is unrelated to the milestone.
- It replaces working code solely for fashion.
- It introduces a framework without a migration plan.
- It increases abstraction without reducing actual complexity.

For large refactors:

1. Characterize current behavior with tests.
2. Define the target boundary.
3. Migrate one vertical slice.
4. Keep the application runnable.
5. Remove the old path after verification.

---

## Git policy

Unless explicitly authorized:

- Do not initialize Git.
- Do not create branches.
- Do not stage.
- Do not commit.
- Do not push.
- Do not open pull requests.
- Do not merge.
- Do not publish or deploy.

At the end of a milestone, provide a suggested commit message only.

If Git operations are later authorized:

- Use focused commits.
- Do not mix unrelated refactors and features.
- Include migration and documentation changes with the feature that requires
  them.
- Never commit `.env`, secrets, uploads, caches, or dependency directories.

---

## Code review checklist

### Product

- [ ] Does the change improve the recovery journey?
- [ ] Is the intended user outcome clear?
- [ ] Are all UI states complete?
- [ ] Are actions and status labels understandable?

### Architecture

- [ ] Is there one source of truth?
- [ ] Are responsibilities separated appropriately?
- [ ] Are important invariants enforced?
- [ ] Does the change avoid unnecessary architectural complexity?

### Backend

- [ ] Are inputs validated?
- [ ] Are queries parameterized?
- [ ] Is identity derived from a trusted source?
- [ ] Are permissions enforced?
- [ ] Are multi-record changes transactional?
- [ ] Are errors safe and consistent?
- [ ] Is sensitive logging avoided?

### Frontend

- `dashboard.html` is the only active Student/Admin application shell.
- Feature navigation must use `navigate()` and a registered canonical hash.
- Do not add active links or JavaScript fallbacks to standalone feature pages.
- A retained legacy feature URL must immediately redirect to its shell hash.
- Store route-specific context in History state so Back/Forward and refresh do
  not silently discard the active workflow.

- [ ] Is untrusted content safely rendered?
- [ ] Are loading/error/empty states present?
- [ ] Is duplicate submission prevented?
- [ ] Is the flow responsive?
- [ ] Is keyboard use supported?
- [ ] Are accessible names and announcements correct?

### Database

- [ ] Is there a migration?
- [ ] Are constraints and indexes appropriate?
- [ ] Is backward compatibility addressed?
- [ ] Is data migration behavior documented?

### Testing

- [ ] Do existing tests pass?
- [ ] Are new domain rules tested?
- [ ] Are failure cases tested?
- [ ] Was the complete user path exercised?

### Documentation

- [ ] Are setup and environment changes documented?
- [ ] Is project state accurate?
- [ ] Are known limitations explicit?

---

## Definition of Done

A milestone is complete only when all applicable items are true:

- The feature works end to end.
- The UI is polished and consistent.
- The user knows what happened and what to do next.
- Existing functionality is preserved.
- Relevant edge cases are handled.
- Loading, success, empty, error, and recovery states exist.
- The experience is responsive.
- Keyboard and accessibility behavior are verified.
- Code is readable and appropriately organized.
- Duplicate or obsolete logic in the milestone path is removed.
- Critical domain rules have focused tests.
- All available tests pass.
- Database changes have migrations and constraints where appropriate.
- No sensitive information is exposed or logged unnecessarily.
- Documentation accurately reflects the new state.
- No obvious TODO or placeholder remains in the completed path.
- A manual test procedure is documented.
- Remaining risks are clearly reported.

“The happy path works once” is not Definition of Done.

## Shared frontend design-system standard

- Use shared CSS tokens for color, spacing, shell dimensions, controls, radii,
  shadows, and content widths instead of page-specific magic numbers.
- Student and Admin workspaces must use the same shell geometry and component
  language even when their content and actions differ.
- Dashboard metrics must cite an existing API payload and calculation; never
  ship placeholder counts or decorative trends.
- Responsive verification must include approximately 390px, 768px, normal
  laptop, and 1440px widths with explicit horizontal-overflow checks.
- Preserve semantic HTML, visible focus, reduced-motion behavior, form labels,
  dialog names, and non-color status text.
- Before changing rendered markup, search every frontend module and test for
  dependent IDs, classes, data attributes, and hierarchy assumptions.

## Asynchronous page-lifecycle standard

- Initial page requests need a bounded lifetime and a visible terminal success,
  empty, cached-warning, or retryable-error state.
- Independent payloads should settle independently when one can provide useful
  UI without the other; document which payload is required.
- Coalesce concurrent initialization rather than relying on navigation side
  effects or firing duplicate requests.
- Cached equality must not suppress rendering of newly loaded dependent state.
- Performance changes require measurements; do not add indexes or cache layers
  based only on speculation.

## Account-recovery standard

- Recovery requests must not reveal account existence.
- Store only cryptographic token hashes; tokens expire and are single-use.
- Successful reset revokes existing sessions.
- Raw tokens may enter only a server delivery adapter and must never be logged,
  placed in frontend storage, or returned by an API.
- Disabled delivery must not expose a development token.
- Protected UI stays hidden until server session validation succeeds.
- Browser role state is presentation only; authorization remains server-derived.
