import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
});
const client = await pool.connect();
const lockKey = "magazine-platform-schema-migrations-v1";

try {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

  for (const name of names) {
    const sql = await readFile(path.join(directory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [name],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${name} was modified. Add a new migration instead.`);
      }
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.info(`Applied database migration: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
  } finally {
    client.release();
    await pool.end();
  }
}
