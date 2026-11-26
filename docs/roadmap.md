# Engineering roadmap

The product direction is a general-purpose visual editor. Backend work precedes frontend work.

## Phase 0 — baseline and risk containment

- [x] Confirm the repository and workspace layout.
- [x] Document the current system and target modular boundaries.
- [x] Establish change and quality standards.
- [ ] Run the complete build in CI and capture baseline status.
- [ ] Add a real test harness; identify critical existing behaviour to characterize.

## Phase 1 — backend foundation (current priority)

- [ ] Audit API routes and middleware end-to-end.
- [ ] Introduce central configuration validation and typed environment access.
- [ ] Introduce a consistent error boundary and response format.
- [ ] Review request body limits, rate limits and CORS policy.
- [ ] Review Clerk session verification and admin/owner authorization.
- [ ] Harden media uploads (signature sniffing, quotas, metadata, safe content headers).
- [ ] Harden media resolution (redirect revalidation, DNS/IP protections, timeouts, concurrency limits).
- [ ] Replace startup schema push and route-level CREATE TABLE helpers with reviewed, versioned migrations.
- [ ] Add repository/service boundaries for the first core domain.
- [ ] Define editor document/revision/block contracts and ownership model.

## Phase 2 — editor API

- [ ] Workspace/document lifecycle.
- [ ] Versioned document content and revision history.
- [ ] Block schema and server-side validation.
- [ ] Media asset lifecycle and ownership.
- [ ] Draft/published lifecycle and public read model.
- [ ] OpenAPI source, generated Zod validators and generated client kept in sync.

## Phase 3 — frontend transformation

- [ ] Map existing UI flows and preserve useful components.
- [ ] Make the editor the primary application experience.
- [ ] Create feature modules for editor, documents, media and publishing.
- [ ] Keep catalog and commerce optional and separately navigable.
- [ ] Add keyboard, responsive, loading, empty and failure states.
- [ ] Add browser tests for create/edit/save/preview/publish.

## Phase 4 — release confidence

- [ ] CI runs lint/typecheck/build/unit/integration tests.
- [ ] Staging deploy and smoke tests.
- [ ] Database backup and migration/rollback runbook.
- [ ] Production observability and actionable alerts.
- [ ] Performance and accessibility checks.

## Non-goals for the first iteration

- No microservices split.
- No mass file moves before import/dependency mapping.
- No destructive database reset or speculative schema rewrite.
- No forced removal of the existing catalog/orders functionality.
- No deployment or infrastructure changes that require paid resources without a separate review.
