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
    await pool.query("CREATE TABLE IF NOT EXISTS products (id integer PRIMARY KEY, name text NOT NULL)");
    await pool.query(
      "INSERT INTO products (id, name) VALUES (901, 'legacy-product') ON CONFLICT (id) DO NOTHING",
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
      "SELECT name, checksum FROM schema_migrations WHERE name = '0002_page_revisions.sql'",
    );
    assert.equal(migrationRows.rowCount, 1);
    assert.match(migrationRows.rows[0].checksum, /^[a-f0-9]{64}$/);

    const tables = await pool.query(`
      SELECT
        to_regclass('public.sites') IS NOT NULL AS sites,
        to_regclass('public.pages') IS NOT NULL AS pages,
        to_regclass('public.page_blocks') IS NOT NULL AS page_blocks,
        to_regclass('public.page_revisions') IS NOT NULL AS page_revisions
    `);
    assert.deepEqual(tables.rows[0], { sites: true, pages: true, page_blocks: true, page_revisions: true });

    const cascadeForeignKeys = await pool.query(`
      SELECT count(*)::int AS count
      FROM pg_constraint
      WHERE conname IN ('pages_site_id_fkey', 'page_blocks_page_id_fkey')
        AND confdeltype = 'c'
    `);
    assert.equal(cascadeForeignKeys.rows[0].count, 2);
  } finally {
    await pool.end();
  }
});
