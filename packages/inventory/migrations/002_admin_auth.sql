BEGIN;

CREATE TABLE IF NOT EXISTS admin_auth_challenges (
  nonce_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  origin TEXT NOT NULL,
  message TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS admin_auth_challenges_expiry_idx
  ON admin_auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS admin_sessions_wallet_idx
  ON admin_sessions (wallet_address, expires_at DESC);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_auth_rate_events (
  event_id UUID PRIMARY KEY,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('challenge', 'verify')),
  wallet_address TEXT NOT NULL,
  client_key_hash TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_auth_rate_wallet_idx
  ON admin_auth_rate_events (event_kind, wallet_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS admin_auth_rate_client_idx
  ON admin_auth_rate_events (event_kind, client_key_hash, occurred_at DESC)
  WHERE client_key_hash IS NOT NULL;

COMMIT;
