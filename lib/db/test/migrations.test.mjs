import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const packageDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("platform migration is repeatable and preserves pre-existing commerce data", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must point to a disposable test database");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS products (
      id serial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      category text NOT NULL,
      description text NOT NULL DEFAULT '',
      price integer NOT NULL,
      image_url text NOT NULL,
      badge text,
      is_featured boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(
      "INSERT INTO products (id, name, slug, category, price, image_url) VALUES (901, 'legacy-product', 'legacy-product', 'legacy', 100, '/legacy.png') ON CONFLICT (id) DO NOTHING",
    );

    const runMigrations = () => execFileSync(process.execPath, ["./migrate.mjs"], {
      cwd: packageDirectory,
      env: process.env,
      stdio: "pipe",
    });

    runMigrations();
    runMigrations();

    const product = await pool.query("SELECT name FROM products WHERE id = 901");
    assert.equal(product.rows[0]?.name, "legacy-product");

    const migrationRows = await pool.query(
      "SELECT name, checksum FROM schema_migrations WHERE name = '0004_legacy_commerce_baseline.sql'",
    );
    assert.equal(migrationRows.rowCount, 1);
    assert.match(migrationRows.rows[0].checksum, /^[a-f0-9]{64}$/);

    const tables = await pool.query(`
      SELECT
        to_regclass('public.sites') IS NOT NULL AS sites,
        to_regclass('public.pages') IS NOT NULL AS pages,
        to_regclass('public.page_blocks') IS NOT NULL AS page_blocks,
        to_regclass('public.page_revisions') IS NOT NULL AS page_revisions,
        to_regclass('public.products') IS NOT NULL AS products,
        to_regclass('public.storefront_settings') IS NOT NULL AS storefront_settings,
        to_regclass('public.store_orders') IS NOT NULL AS store_orders,
        to_regclass('public.site_media') IS NOT NULL AS site_media
    `);
    assert.deepEqual(tables.rows[0], { sites: true, pages: true, page_blocks: true, page_revisions: true, products: true, storefront_settings: true, store_orders: true, site_media: true });

    const cascadeForeignKeys = await pool.query(`
      SELECT count(*)::int AS count
      FROM pg_constraint
      WHERE conname IN ('pages_site_id_fkey', 'page_blocks_page_id_fkey')
        AND confdeltype = 'c'
    `);
    assert.equal(cascadeForeignKeys.rows[0].count, 2);

    const [site] = (await pool.query(
      "INSERT INTO sites (owner_id, name, slug) VALUES ('user_test_1', 'Blank site', 'blank-site') RETURNING id",
    )).rows;
    const [page] = (await pool.query(
      "INSERT INTO pages (site_id, title, slug) VALUES ($1, 'Home', 'home') RETURNING id",
      [site.id],
    )).rows;
    await pool.query(
      "INSERT INTO page_blocks (page_id, type, position, config) VALUES ($1, 'text', 0, $2::jsonb)",
      [page.id, JSON.stringify({ text: "Hello" })],
    );
    await pool.query(
      "INSERT INTO page_revisions (page_id, revision_number, snapshot, created_by) VALUES ($1, 1, $2::jsonb, 'user_test_1')",
      [page.id, JSON.stringify({ page: { title: "Home", slug: "home", sortOrder: 0, seo: {} }, blocks: [{ type: "text", schemaVersion: 1, position: 0, config: { text: "Hello" } }] })],
    );
    await pool.query(
      "UPDATE pages SET status = 'published', published_revision_number = 1, published_slug = 'home', published_at = now() WHERE id = $1",
      [page.id],
    );
    const published = await pool.query(
      "SELECT status, published_revision_number, published_slug FROM pages WHERE id = $1",
      [page.id],
    );
    assert.deepEqual(published.rows[0], { status: "published", published_revision_number: 1, published_slug: "home" });
    const publicSnapshot = await pool.query(`
      SELECT revisions.snapshot
      FROM sites
      INNER JOIN pages ON pages.site_id = sites.id
      INNER JOIN page_revisions AS revisions
        ON revisions.page_id = pages.id
       AND revisions.revision_number = pages.published_revision_number
      WHERE sites.id = $1 AND pages.published_slug = 'home' AND pages.status = 'published'
    `, [site.id]);
    assert.equal(publicSnapshot.rows[0]?.snapshot.blocks[0]?.config.text, "Hello");

    // Draft edits must not change the public route or published snapshot.
    await pool.query("UPDATE pages SET slug = 'draft-home', title = 'Draft title' WHERE id = $1", [page.id]);
    const afterDraftEdit = await pool.query(
      `SELECT revisions.snapshot
       FROM pages
       INNER JOIN page_revisions AS revisions
         ON revisions.page_id = pages.id
        AND revisions.revision_number = pages.published_revision_number
       WHERE pages.id = $1 AND pages.published_slug = 'home' AND pages.status = 'published'`,
      [page.id],
    );
    assert.equal(afterDraftEdit.rows[0]?.snapshot.page.title, "Home");
    assert.equal(afterDraftEdit.rows[0]?.snapshot.page.slug, "home");
    const draftSlugPublicLookup = await pool.query(
      "SELECT id FROM pages WHERE id = $1 AND published_slug = 'draft-home'",
      [page.id],
    );
    assert.equal(draftSlugPublicLookup.rowCount, 0);

    await pool.query("DELETE FROM sites WHERE id = $1", [site.id]);
    const cascaded = await pool.query(
      "SELECT (SELECT count(*) FROM pages WHERE id = $1)::int AS pages, (SELECT count(*) FROM page_revisions WHERE page_id = $1)::int AS revisions",
      [page.id],
    );
    assert.deepEqual(cascaded.rows[0], { pages: 0, revisions: 0 });
  } finally {
    await pool.end();
  }
});


test("all managed tables are created on a fresh schema", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must point to a disposable test database");
  const rootPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `migration_fresh_${process.pid}`;
  const isolatedUrl = new URL(process.env.DATABASE_URL);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
  const isolatedConnection = isolatedUrl.toString();

  try {
    await rootPool.query(`CREATE SCHEMA "${schema}"`);
    execFileSync(process.execPath, ["./migrate.mjs"], {
      cwd: packageDirectory,
      env: { ...process.env, DATABASE_URL: isolatedConnection },
      stdio: "pipe",
    });

    const isolatedPool = new Pool({ connectionString: isolatedConnection });
    try {
      const tables = await isolatedPool.query(`
        SELECT
          to_regclass('sites') IS NOT NULL AS sites,
          to_regclass('pages') IS NOT NULL AS pages,
          to_regclass('page_blocks') IS NOT NULL AS page_blocks,
          to_regclass('page_revisions') IS NOT NULL AS page_revisions,
          to_regclass('products') IS NOT NULL AS products,
          to_regclass('storefront_settings') IS NOT NULL AS storefront_settings,
          to_regclass('store_orders') IS NOT NULL AS store_orders,
          to_regclass('site_media') IS NOT NULL AS site_media
      `);
      assert.deepEqual(tables.rows[0], {
        sites: true,
        pages: true,
        page_blocks: true,
        page_revisions: true,
        products: true,
        storefront_settings: true,
        store_orders: true,
        site_media: true,
      });
    } finally {
      await isolatedPool.end();
    }
  } finally {
    await rootPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await rootPool.end();
  }
});
