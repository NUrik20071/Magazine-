# Backend audit — initial static review

**Repository snapshot:** `main` at `8300599cbb3c06dcdcadd7a260dc500e8e1b5234`  
**Date:** 2026-11-26  
**Scope:** source-level review of Express API, Render startup, PostgreSQL schema and CI. This is not a penetration test and does not claim runtime verification.

## Findings

### P0 — Production schema mutation runs during every service start

**Evidence**
- `render.yaml` starts the service with `pnpm --filter @workspace/db run push` before the API.
- `artifacts/api-server/src/routes/orders.ts` contains an `ensureOrdersTable()` helper that runs `CREATE TABLE IF NOT EXISTS`.
- `artifacts/api-server/src/routes/media.ts` has another runtime `CREATE TABLE IF NOT EXISTS` helper.
- `lib/db/src/schema/managedTables.ts` already declares both tables.

**Risk:** runtime startup and first-request paths are responsible for schema creation. Schema changes are not represented as a reviewed, ordered migration history. Duplicate schema definitions can drift.

**Remediation:** introduce versioned Drizzle/SQL migrations; verify the current production schema and backup/restore path; apply migrations as a separate release step; remove route-level DDL only after migration parity is proven. Do not simply delete the current push command before the migration replacement is ready.

### P1 — Expensive public media resolution has no visible rate/concurrency limit

**Evidence**
- `artifacts/api-server/src/routes/mediaResolve.ts` exposes `GET /media/resolve` without authentication.
- It may run `yt-dlp` and `gallery-dl` subprocesses with timeouts up to 30 seconds and buffers up to 4 MiB.
- The extractor path runs before HTML metadata fallback.

**Risk:** a public caller can consume CPU, memory, subprocess slots and outbound bandwidth. Per-process timeouts do not cap aggregate concurrency or request rate.

**Remediation:** add a shared rate/concurrency budget, bounded queue, per-provider timeout policy, request cancellation and observability. Keep public preview capability if required by the editor, but protect it from abuse. For multiple instances, use a shared limiter rather than relying only on in-memory state.

### P1 — Media upload validates declared MIME type, not file content

**Evidence**
- `artifacts/api-server/src/routes/media.ts` accepts a content-type header from a fixed allowlist and stores the raw bytes in PostgreSQL.
- The upload limit is 25 MiB and the public media route serves the stored MIME type inline.

**Risk:** the client controls the declared MIME type. A file can be mislabeled; serving unverified bytes inline can create content-sniffing or parser risks.

**Remediation:** inspect magic bytes/signatures server-side, verify the detected format matches the allowlist, set `X-Content-Type-Options: nosniff`, use safe content-disposition policy, and consider image re-encoding or isolated media storage. Add per-owner quotas and retention controls.

### P1 — Public order creation is an unauthenticated write endpoint

**Evidence**
- `artifacts/api-server/src/routes/orders.ts` accepts `POST /orders` without an authentication middleware.
- It performs useful field/quantity validation and recalculates prices from active database products, but there is no route-level rate limit visible in this file.

**Risk:** automated spam can create large volumes of pending orders and database writes.

**Remediation:** retain guest checkout only if intended; add rate limits, idempotency, abuse monitoring and an explicit privacy/retention policy. Do not make authentication mandatory merely to close the finding if guest ordering is a product requirement.

### P1 — Public catalog reads have no pagination

**Evidence**
- `artifacts/api-server/src/routes/products.ts` selects every active product for `GET /products` and `/store/summary`.
- Search and category filters are available, but the route does not apply a result limit or cursor.

**Risk:** catalog growth increases database work and response size; wildcard search can broaden matches.

**Remediation:** design cursor pagination in the API contract and generated client, preserve a compatibility window for current clients, and cap summary queries independently.

### P2 — Error handling is not normalized at the application boundary

**Evidence**
- `artifacts/api-server/src/app.ts` mounts the router but no final API error middleware is visible.
- Some routes catch and map errors locally while other async handlers allow errors to reach Express 5's default error handling.

**Risk:** response shape and operational logging differ between routes, making failures harder to monitor and clients harder to reason about.

**Remediation:** introduce typed application errors and a final sanitized error middleware; preserve request IDs and never expose provider messages, credentials or stack traces.

### P2 — Automated test coverage is absent from the repository snapshot

**Evidence**
- The recursive Git tree contains no test/spec paths.
- Root CI runs frozen pnpm install and `pnpm run build`; package type checks are included in the build.

**Risk:** architectural extraction and security fixes lack regression protection.

**Remediation:** establish tests with the first extracted backend domain. Prioritize authorization policy, order price calculation, media validation, URL policy, and migration behaviour. Do not claim test coverage until tests actually run in CI.

## Positive controls already present

- Clerk admin access checks a verified email against a server-side allowlist.
- Product create/update request bodies are validated through generated Zod schemas.
- Order totals are recalculated from database prices rather than trusting client totals.
- SQL parameters are bound rather than interpolated in the reviewed query paths.
- CORS permits only configured cross-origin browser origins.
- Request logging redacts authorization and cookie headers.
- Health endpoint is independent of optional Clerk configuration.
- Media resolver restricts source URLs to an explicit hostname allowlist and manually checks redirect hosts.

## Execution order

1. Characterization tests and error/observability baseline.
2. Upload validation and media resolver resource controls.
3. Public write endpoint abuse controls.
4. Versioned database migrations with backup/rollback proof.
5. Cursor pagination and OpenAPI/client regeneration.
6. Extract editor domain services/repositories and define document/revision/block contracts.

All findings above are based on source inspection. Runtime tests, production configuration verification and a penetration test remain separate tasks.
