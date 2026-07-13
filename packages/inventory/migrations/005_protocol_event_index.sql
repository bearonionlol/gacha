BEGIN;

CREATE TABLE IF NOT EXISTS protocol_chain_checkpoints (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  stream_key TEXT NOT NULL,
  next_block BIGINT NOT NULL CHECK (next_block >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, stream_key)
);

CREATE TABLE IF NOT EXISTS protocol_chain_events (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL CHECK (log_index >= 0),
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'PackPurchased',
    'PackRevealed',
    'PackRefunded',
    'ListingCreated',
    'ListingCancelled',
    'ListingSold',
    'RedemptionRequested',
    'RedemptionStatusUpdated'
  )),
  payload JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS protocol_chain_events_block_idx
  ON protocol_chain_events (chain_id, block_number, log_index);
CREATE INDEX IF NOT EXISTS protocol_chain_events_pending_idx
  ON protocol_chain_events (chain_id, block_number, log_index)
  WHERE reconciled_at IS NULL;

CREATE TABLE IF NOT EXISTS protocol_capsule_purchases (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  purchase_id BIGINT NOT NULL CHECK (purchase_id > 0),
  drop_id BIGINT NOT NULL CHECK (drop_id > 0),
  buyer_address TEXT NOT NULL,
  request_id TEXT NOT NULL,
  price_wei TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'revealed', 'refunded')),
  purchase_transaction_hash TEXT NOT NULL,
  purchase_block_number BIGINT NOT NULL CHECK (purchase_block_number >= 0),
  reveal_transaction_hash TEXT,
  reveal_block_number BIGINT,
  refund_transaction_hash TEXT,
  refund_block_number BIGINT,
  inventory_id TEXT,
  token_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, purchase_id),
  UNIQUE (chain_id, request_id)
);

CREATE INDEX IF NOT EXISTS protocol_capsule_buyer_idx
  ON protocol_capsule_purchases (chain_id, LOWER(buyer_address), purchase_id DESC);

CREATE TABLE IF NOT EXISTS inventory_chain_state (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  inventory_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  owner_address TEXT,
  custody_status TEXT NOT NULL CHECK (custody_status IN (
    'tokenized',
    'user_owned',
    'listed',
    'redemption_pending',
    'redeemed'
  )),
  active_listing_id BIGINT,
  active_redemption_request_id BIGINT,
  last_transaction_hash TEXT NOT NULL,
  last_log_index INTEGER NOT NULL CHECK (last_log_index >= 0),
  last_block_number BIGINT NOT NULL CHECK (last_block_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, inventory_id),
  UNIQUE (chain_id, token_id)
);

CREATE TABLE IF NOT EXISTS marketplace_listing_state (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  listing_id BIGINT NOT NULL CHECK (listing_id > 0),
  inventory_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  buyer_address TEXT,
  amount TEXT NOT NULL,
  price_wei TEXT NOT NULL,
  fee_wei TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'sold')),
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, listing_id)
);

CREATE TABLE IF NOT EXISTS redemption_request_state (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  request_id BIGINT NOT NULL CHECK (request_id > 0),
  inventory_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  requester_address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'requested',
    'approved',
    'packed',
    'shipped',
    'completed',
    'cancelled'
  )),
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, request_id)
);

COMMIT;
