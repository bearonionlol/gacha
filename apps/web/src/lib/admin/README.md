# Admin server configuration

The admin API remains in read-only demo mode until all required variables are set:

- `DATABASE_URL`: PostgreSQL connection string.
- `ADMIN_SESSION_SECRET`: random server-only value of at least 32 characters.
- `ADMIN_ALLOWED_ORIGINS`: comma-separated exact origins, for example `https://ops.example.com`.
- `ADMIN_WALLET_ROLES`: JSON object mapping wallet addresses to `viewer`, `inventory_operator`,
  `inventory_manager`, or `admin`.

Optional security and database variables:

- `DATABASE_SSL=disable` for local PostgreSQL only; production defaults to verified TLS.
- `DATABASE_CA_CERT`: PEM certificate chain for the database.
- `ADMIN_SESSION_TTL_SECONDS`: 900–86400; defaults to 28800.
- `ADMIN_TRUST_PROXY=true`: trust the first `X-Forwarded-For` value for IP rate limiting. Enable only
  when the edge proxy overwrites that header.
- `ADMIN_AUTH_RATE_WINDOW_SECONDS`: 60–86400; defaults to 900.
- `ADMIN_AUTH_CHALLENGE_WALLET_LIMIT` / `ADMIN_AUTH_CHALLENGE_CLIENT_LIMIT`: defaults to 10 / 30.
- `ADMIN_AUTH_VERIFY_WALLET_LIMIT` / `ADMIN_AUTH_VERIFY_CLIENT_LIMIT`: defaults to 20 / 60.

Mainnet requests remain disabled unless both variables are explicitly present:

- `ADMIN_PRODUCTION_OPERATIONS_ENABLED=true`
- `ADMIN_MULTISIG_ADDRESS`: reviewed multisig destination.

Enabling these values creates immutable queue requests only. The web app has no private-key input,
signer, or browser-direct privileged transaction path. A separate multisig process must simulate,
approve, execute, and reconcile each request.

Run `pnpm --filter @gacha/inventory migrate:admin` before enabling production mode. Authenticated
operators can query `GET /api/admin/readiness`; its response contains only configuration state, table
readiness, and the non-signing queue mode.
