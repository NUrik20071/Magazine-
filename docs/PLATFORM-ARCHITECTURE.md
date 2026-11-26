# Magazine Platform Architecture

## Product direction

Magazine is a general-purpose visual website builder, not a store-first application.
A newly created site must be blank by default. It must not contain product cards,
a catalog, a cart, checkout, shop navigation, or demo storefront copy unless the
site owner explicitly enables the commerce module or selects a commerce starter kit.

The visual editor is the primary product surface. Commerce is an optional module.

## Backend-first implementation plan

### Phase 1 — Establish the platform core

1. Audit the existing PostgreSQL schema, migrations, generated API contracts,
   authentication middleware, and deployment lifecycle.
2. Introduce a tenant/site ownership model. Every editable resource must be scoped
   to a site and authorized against its owner or role.
3. Introduce generic content entities:
   - sites: identity, owner, slug/domain, status, settings;
   - pages: site, title, slug, publication status, SEO metadata;
   - page revisions: immutable snapshots and restore points;
   - blocks: typed, validated JSON configuration ordered within a page;
   - assets: metadata and storage key, not binary content in the long term;
   - themes: design tokens and typography, not fixed shop-specific fields.
4. Add versioned database migrations. Do not create or alter tables inside request
   handlers.
5. Add generic APIs for site/page/block/asset CRUD, preview, publish, and revisions.
6. Enforce ownership and role checks on every write endpoint.
7. Add pagination, input validation, request limits, structured errors, audit events,
   and integration tests.
8. Keep the existing product/order tables isolated as an optional commerce module.
   Do not make them prerequisites for creating or publishing a site.

### Phase 2 — Make commerce optional

- Move product, cart, order, and checkout functionality behind a commerce capability.
- Do not expose commerce routes or navigation when the capability is disabled.
- Keep existing customer/order data intact during migration.
- Provide explicit opt-in migration and rollback procedures.

### Phase 3 — Frontend editor (after backend contracts stabilize)

- New site starts with an empty page/canvas.
- User adds blocks from a block library: text, image, video, button, embed, gallery,
  map, form, and layout containers.
- Blocks can be reordered, duplicated, configured, hidden, and deleted.
- Pages can be created, renamed, reordered, previewed, published, and restored.
- Theme controls configure colors, fonts, spacing, and responsive behavior.
- Starter templates are optional and never silently applied.

## Backend acceptance criteria

- A user can create a site without creating products or store settings.
- A site can contain multiple pages with ordered blocks.
- A user cannot read or mutate another user's private site by changing an ID.
- Draft changes do not affect the published version until publish is called.
- Previous published versions can be restored.
- All schema changes are migrations, not request-time DDL.
- Core APIs have integration tests and OpenAPI/Zod contracts.
- Existing commerce data remains available and is not destructively migrated.

## Non-goals for the first backend release

- Payments, subscriptions, marketplace, multi-vendor commerce.
- Arbitrary server-side JavaScript execution.
- A complex plugin marketplace.
- Rewriting the existing frontend before the generic backend contracts are stable.
