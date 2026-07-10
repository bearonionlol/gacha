# Inventory persistence

Apply the PostgreSQL migrations in deterministic filename order:

```sh
MIGRATION_DATABASE_URL=postgresql://... DATABASE_SSL=require pnpm --filter @gacha/inventory migrate:admin
```

The runner takes a PostgreSQL advisory lock, records SHA-256 migration hashes in
`admin_schema_migrations`, skips matching applied migrations, and fails if an applied file changes.
Set `DATABASE_SSL=disable` only for a local PostgreSQL instance. For production certificate pinning,
provide the PEM chain through `DATABASE_CA_CERT` (escaped newlines are accepted).

Use a schema-owner credential only for `MIGRATION_DATABASE_URL`. The web application's `DATABASE_URL`
should use a restricted role with only the required table operations; it should not own the append-only
audit or multisig-queue tables.
