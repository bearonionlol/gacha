import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const databaseUrl = (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required for inventory migrations");

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right));

if (migrationNames.length === 0) throw new Error("No inventory migrations were found");

const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
const ssl = process.env.DATABASE_SSL === "disable"
  ? false
  : { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
const pool = new pg.Pool({ application_name: "gacha-admin-migrations", connectionString: databaseUrl, max: 1, ssl });
const client = await pool.connect();

try {
  await client.query("SELECT pg_advisory_lock(hashtext('gacha_admin_schema_migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS admin_schema_migrations (
    migration_name TEXT PRIMARY KEY,
    content_sha256 TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  for (const migrationName of migrationNames) {
    const sql = await readFile(resolve(migrationsDirectory, migrationName), "utf8");
    const digest = createHash("sha256").update(sql, "utf8").digest("hex");
    const existing = await client.query(
      "SELECT content_sha256 FROM admin_schema_migrations WHERE migration_name = $1",
      [migrationName]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].content_sha256 !== digest) {
        throw new Error(`Applied migration changed on disk: ${migrationName}`);
      }
      process.stdout.write(`already applied ${migrationName}\n`);
      continue;
    }

    await client.query(sql);
    await client.query(
      "INSERT INTO admin_schema_migrations (migration_name, content_sha256) VALUES ($1, $2)",
      [migrationName, digest]
    );
    process.stdout.write(`applied ${migrationName}\n`);
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('gacha_admin_schema_migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}
