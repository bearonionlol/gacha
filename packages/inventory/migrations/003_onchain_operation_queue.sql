BEGIN;

ALTER TABLE inventory_audit_events
  DROP CONSTRAINT IF EXISTS inventory_audit_events_action_check;
ALTER TABLE inventory_audit_events
  ADD CONSTRAINT inventory_audit_events_action_check CHECK (action IN (
    'inventory.created',
    'inventory.updated',
    'inventory.transitioned',
    'inventory.deleted',
    'inventory.onchain_queued'
  ));

CREATE TABLE IF NOT EXISTS inventory_onchain_operations (
  operation_id UUID PRIMARY KEY,
  inventory_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('anchor_metadata', 'publish_drop')),
  expected_revision BIGINT NOT NULL CHECK (expected_revision > 0),
  status TEXT NOT NULL CHECK (status = 'queued'),
  multisig_address TEXT NOT NULL,
  actor_wallet_address TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_onchain_operations_idempotency_idx UNIQUE (inventory_id, action, expected_revision)
);

CREATE INDEX IF NOT EXISTS inventory_onchain_operations_inventory_idx
  ON inventory_onchain_operations (inventory_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_inventory_onchain_operation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_onchain_operations is append-only';
END;
$$;

DROP TRIGGER IF EXISTS inventory_onchain_operations_append_only ON inventory_onchain_operations;
CREATE TRIGGER inventory_onchain_operations_append_only
BEFORE UPDATE OR DELETE ON inventory_onchain_operations
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_onchain_operation_mutation();

DROP TRIGGER IF EXISTS inventory_onchain_operations_no_truncate ON inventory_onchain_operations;
CREATE TRIGGER inventory_onchain_operations_no_truncate
BEFORE TRUNCATE ON inventory_onchain_operations
FOR EACH STATEMENT EXECUTE FUNCTION prevent_inventory_onchain_operation_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON inventory_onchain_operations FROM PUBLIC;

COMMIT;
