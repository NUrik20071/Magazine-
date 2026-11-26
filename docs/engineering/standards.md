# Engineering standards

These rules apply to all new work in Magazine-.

## Change safety

- Work on a focused branch and open a pull request.
- Keep each pull request small enough to review.
- Never rewrite the default branch history.
- Never delete or rename existing features as part of an unrelated refactor.
- Preserve existing API and database behaviour unless the change explicitly migrates it.
- Every risky change needs a rollback or compatibility plan.

## Module design

- One module = one business capability with a clear owner and public interface.
- Keep transport (routes/controllers), application logic (services), domain rules, and persistence (repositories) separate when the complexity justifies it.
- Avoid one-file-per-function fragmentation.
- Avoid circular imports and hidden cross-module state.
- Generated code is not a place for hand-written business logic.

## Backend

- Validate all untrusted input at the boundary.
- Apply authentication and authorization per route; UI visibility is never authorization.
- Use parameterized SQL/Drizzle queries.
- Set explicit request, upload, extraction, and outbound-network limits.
- Centralize error mapping; do not return secrets, stack traces, tokens, or raw provider errors.
- Log request identifiers and safe metadata; redact credentials, cookies, personal data and media URLs where applicable.
- Keep readiness/health checks independent from optional third-party auth.
- Database schema changes must be versioned and reviewed. Do not run an implicit schema push as an ordinary production process start.

## Frontend

- Organize by feature/domain, not only by file extension.
- Keep editor state transitions deterministic and testable.
- Separate persisted document data from transient canvas/selection state.
- Use accessible keyboard and pointer interactions.
- Handle loading, empty, error, offline and permission-denied states explicitly.

## Quality gates

Before merge:
1. frozen dependency install;
2. TypeScript checks;
3. production build;
4. unit tests for domain rules and utilities;
5. integration tests for authorization, persistence and API contracts;
6. end-to-end tests for critical editor workflows as those workflows are introduced;
7. security review for upload, external URL resolution, auth and persistence changes.

Do not add a test command that always succeeds or pretend unimplemented tests exist. Add tests alongside the first extracted modules and enforce them in CI when the test suite is real.

## Security and secrets

- Never commit `.env`, private keys, tokens, database URLs or user exports.
- Keep Clerk secret keys server-side only.
- Prefer explicit allowlists for origins and external providers.
- Revalidate redirect destinations and every redirect hop in outbound media resolution.
- Verify file signatures, not just client-supplied MIME types.
- Rate-limit public write endpoints and expensive external extraction operations.
- Set resource quotas and retention rules for uploaded media.
