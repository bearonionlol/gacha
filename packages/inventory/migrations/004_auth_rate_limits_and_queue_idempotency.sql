BEGIN;

DROP INDEX IF EXISTS admin_auth_challenges_active_wallet_idx;

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

CREATE UNIQUE INDEX IF NOT EXISTS inventory_onchain_operations_idempotency_idx
  ON inventory_onchain_operations (inventory_id, action, expected_revision);

COMMIT;
