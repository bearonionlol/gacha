BEGIN;

CREATE TABLE IF NOT EXISTS inventory_items (
  inventory_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (inventory_id = payload->>'inventoryId')
);

CREATE INDEX IF NOT EXISTS inventory_items_updated_idx
  ON inventory_items (updated_at DESC, inventory_id);
CREATE INDEX IF NOT EXISTS inventory_items_brand_idx
  ON inventory_items ((payload->>'brand'));
CREATE INDEX IF NOT EXISTS inventory_items_status_idx
  ON inventory_items ((payload->>'custodyStatus'));

CREATE TABLE IF NOT EXISTS inventory_audit_events (
  event_id UUID PRIMARY KEY,
  inventory_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'inventory.created',
    'inventory.updated',
    'inventory.transitioned',
    'inventory.deleted',
    'inventory.onchain_queued'
  )),
  revision BIGINT NOT NULL CHECK (revision > 0),
  actor_wallet_address TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_request_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS inventory_audit_inventory_idx
  ON inventory_audit_events (inventory_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_inventory_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS inventory_audit_events_append_only ON inventory_audit_events;
CREATE TRIGGER inventory_audit_events_append_only
BEFORE UPDATE OR DELETE ON inventory_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_audit_mutation();

DROP TRIGGER IF EXISTS inventory_audit_events_no_truncate ON inventory_audit_events;
CREATE TRIGGER inventory_audit_events_no_truncate
BEFORE TRUNCATE ON inventory_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_inventory_audit_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON inventory_audit_events FROM PUBLIC;

COMMIT;
