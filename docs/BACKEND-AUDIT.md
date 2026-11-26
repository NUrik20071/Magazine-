# Backend Audit — baseline from main

Audit baseline: `main` at the time this report was prepared. This is a static source/configuration review; runtime, load, and penetration tests have not yet been performed.

## Product architecture findings

- The current API is store-first: product catalog, store summary, admin product CRUD, and orders are registered unconditionally.
- `products` is part of the core Drizzle schema.
- `storefront_settings` defaults contain a pre-filled shop identity, shop navigation labels, hero copy, catalog/story sections, and shop-specific theme settings.
- The current settings document has generic custom blocks and workflows, but its surrounding contract remains coupled to storefront fields.
- The existing client and API include product/cart/order assumptions. These should become an optional commerce capability, not the default site model.

## Verified backend findings

### Database lifecycle
- `render.yaml` runs `pnpm --filter @workspace/db run push` on every service start.
- `@workspace/db` exposes `push` and `push-force`, but no migration generation or migration execution script was found in the inspected package.
- `orders.ts`, `media.ts`, and `storefrontSettings.ts` each create/ensure tables from request handlers.
- This makes schema lifecycle implicit and spreads DDL concerns across request code.

### API and validation
- `products.ts` lists all matching active products without pagination.
- `/store/summary` is store-specific and should not be required by the platform core.
- The OpenAPI document currently describes health and product/store endpoints; generic sites/pages/blocks/revisions are not represented.
- API server package scripts include build, start, and typecheck, but no test script was found.
- Root CI runs typecheck/build, but no automated test suite was found in the inspected tree.

### Authorization
- Admin access is currently based on a verified Clerk email matching `ADMIN_EMAILS`.
- This is suitable for a small operator-only admin area, but it is not a tenant ownership model.
- New site/page/block APIs must enforce ownership at the data-access boundary; checking only that a user is signed in is insufficient.

### Orders
- Order creation re-reads product prices from PostgreSQL instead of trusting client-submitted prices. Preserve this property if commerce remains enabled.
- Order creation is a request/lead workflow, not a payment integration. The API response explicitly says the order is awaiting review.
- Order routes currently use a runtime `ensureOrdersTable()` helper.

### Media
- Uploads are restricted by declared MIME type and size (25 MiB), but the inspected handler does not validate file signatures.
- Media bytes are stored in PostgreSQL `BYTEA`.
- Move to object storage later behind a storage adapter; preserve stable asset IDs and URLs during the transition.

### Health
- `/api/healthz` reports `ok` without checking PostgreSQL connectivity.
- Separate liveness from readiness before relying on the endpoint for deployment health.

## Recommended implementation sequence

1. Keep this work on `refactor/platform-core-backend`; do not commit directly to `main`.
2. Introduce migration tooling and baseline the current schema before changing it.
3. Add platform tables: sites, pages, page revisions, assets, and audit events.
4. Add authenticated owner-scoped APIs and integration tests.
5. Add draft/publish/restore semantics.
6. Convert store settings to generic site settings with an empty default document.
7. Keep products/orders isolated as an optional commerce module and preserve existing data.
8. Only after API contracts stabilize, replace the storefront-first frontend with the empty-canvas visual editor.

## Safety constraints

- No destructive schema changes before a backup and migration rehearsal.
- No dropping or renaming existing product/order tables as part of the initial platform-core migration.
- No arbitrary server-side JavaScript execution for user-created sites.
- User-authored custom HTML/CSS/JS must be treated as a separate, high-risk capability and sandboxed or disabled by default.
