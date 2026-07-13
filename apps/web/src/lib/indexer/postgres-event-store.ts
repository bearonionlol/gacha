import "server-only";

import type {
  InventoryChainEvidence,
  InventoryStatus,
  PostgresPoolLike,
  PostgresQueryable,
  PostgresTransactionClient
} from "@gacha/inventory";
import { getAddress, type Address, type Hex } from "viem";

import type { CapsulePurchase } from "../capsules";
import {
  eventPayload,
  redemptionStatusName,
  type ProtocolEvent
} from "./protocol-events";

export type InventoryReconciliationAction = {
  chainEvidence: InventoryChainEvidence;
  inventoryId: string;
  targetStatus: InventoryStatus;
};

type EventRow = {
  block_hash: string;
  block_number: string | number;
  contract_address: string;
  event_name: string;
  reconciled_at: Date | string | null;
};
type InventoryChainRow = { inventory_id: string; owner_address: string | null; token_id: string };
type ListingRow = {
  amount: string;
  inventory_id: string;
  price_wei: string;
  seller_address: string;
  status: "active" | "cancelled" | "sold";
  token_id: string;
};
type RedemptionRow = {
  inventory_id: string;
  requester_address: string;
  status: ReturnType<typeof redemptionStatusName>;
  token_id: string;
};
type CapsuleRow = {
  buyer_address: string;
  chain_id: string | number;
  drop_id: string | number;
  inventory_id: string | null;
  price_wei: string;
  purchase_block_number: string | number;
  purchase_id: string | number;
  purchase_transaction_hash: string;
  refund_transaction_hash: string | null;
  request_id: string;
  reveal_transaction_hash: string | null;
  status: CapsulePurchase["status"];
  token_id: string | null;
};

export class PostgresProtocolEventStore {
  constructor(private readonly pool: PostgresPoolLike) {}

  async getCheckpoint(chainId: number, streamKey: string): Promise<bigint | null> {
    const result = await this.pool.query<{ next_block: string | number }>(
      "SELECT next_block FROM protocol_chain_checkpoints WHERE chain_id = $1 AND stream_key = $2",
      [chainId, streamKey]
    );
    const value = result.rows[0]?.next_block;
    return value === undefined ? null : BigInt(value);
  }

  async setCheckpoint(chainId: number, streamKey: string, nextBlock: bigint): Promise<void> {
    await this.pool.query(
      `INSERT INTO protocol_chain_checkpoints (chain_id, stream_key, next_block, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (chain_id, stream_key) DO UPDATE
       SET next_block = EXCLUDED.next_block, updated_at = NOW()`,
      [chainId, streamKey, nextBlock.toString()]
    );
  }

  async withStreamLock<T>(chainId: number, streamKey: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const lockKey = `gacha-protocol-indexer:${chainId}:${streamKey}`;
    try {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [lockKey]
      );
      if (lock.rows[0]?.acquired !== true) throw new Error("Protocol indexer synchronization is already running");
      try {
        return await operation();
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      }
    } finally {
      client.release();
    }
  }

  async stage(event: ProtocolEvent): Promise<InventoryReconciliationAction | null> {
    return this.#transaction(async (client) => {
      await client.query(
        `INSERT INTO protocol_chain_events (
           chain_id, transaction_hash, log_index, block_number, block_hash,
           contract_address, event_name, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
        [
          event.chainId,
          event.transactionHash,
          event.logIndex,
          event.blockNumber.toString(),
          event.blockHash,
          event.contractAddress,
          event.kind,
          JSON.stringify(eventPayload(event))
        ]
      );
      const stored = await client.query<EventRow>(
        `SELECT block_hash, block_number, contract_address, event_name, reconciled_at
         FROM protocol_chain_events
         WHERE chain_id = $1 AND transaction_hash = $2 AND log_index = $3
         FOR UPDATE`,
        [event.chainId, event.transactionHash, event.logIndex]
      );
      const storedEvent = stored.rows[0];
      if (storedEvent === undefined) throw new Error(`Protocol event ${event.transactionHash}:${event.logIndex} was not stored`);
      if (
        storedEvent.block_hash.toLowerCase() !== event.blockHash.toLowerCase()
        || String(storedEvent.block_number) !== event.blockNumber.toString()
        || storedEvent.contract_address.toLowerCase() !== event.contractAddress.toLowerCase()
        || storedEvent.event_name !== event.kind
      ) {
        throw new Error(`Conflicting protocol event evidence for ${event.transactionHash}:${event.logIndex}`);
      }
      if (storedEvent.reconciled_at != null) return null;
      return this.#materialize(client, event);
    });
  }

  async markReconciled(event: ProtocolEvent): Promise<void> {
    await this.pool.query(
      `UPDATE protocol_chain_events SET reconciled_at = COALESCE(reconciled_at, NOW())
       WHERE chain_id = $1 AND transaction_hash = $2 AND log_index = $3`,
      [event.chainId, event.transactionHash, event.logIndex]
    );
  }

  async listCapsules(walletAddress: Address, chainId: number, limit = 20): Promise<CapsulePurchase[]> {
    const result = await this.pool.query<CapsuleRow>(
      `SELECT chain_id, purchase_id, drop_id, buyer_address, request_id, price_wei, status,
              purchase_transaction_hash, purchase_block_number, reveal_transaction_hash,
              refund_transaction_hash, inventory_id, token_id
         FROM protocol_capsule_purchases
        WHERE LOWER(buyer_address) = LOWER($1) AND chain_id = $2
        ORDER BY purchase_id DESC
        LIMIT $3`,
      [walletAddress, chainId, Math.max(1, Math.min(limit, 50))]
    );
    return result.rows.map((row) => ({
      buyerAddress: row.buyer_address as Address,
      chainId: Number(row.chain_id),
      dropId: String(row.drop_id),
      inventoryId: row.inventory_id,
      priceWei: row.price_wei,
      purchaseBlockNumber: String(row.purchase_block_number),
      purchaseId: String(row.purchase_id),
      purchaseTransactionHash: row.purchase_transaction_hash as Hex,
      refundTransactionHash: row.refund_transaction_hash as Hex | null,
      requestId: row.request_id as Hex,
      revealTransactionHash: row.reveal_transaction_hash as Hex | null,
      status: row.status,
      tokenId: row.token_id
    }));
  }

  async #materialize(
    client: PostgresQueryable,
    event: ProtocolEvent
  ): Promise<InventoryReconciliationAction | null> {
    switch (event.kind) {
      case "PackPurchased":
        await this.#recordPurchase(client, event);
        return null;
      case "PackRevealed":
        return this.#recordReveal(client, event);
      case "PackRefunded":
        await this.#recordRefund(client, event);
        return null;
      case "ListingCreated":
        return this.#recordListing(client, event);
      case "ListingCancelled":
        return this.#recordListingCancellation(client, event);
      case "ListingSold":
        return this.#recordListingSale(client, event);
      case "RedemptionRequested":
        return this.#recordRedemption(client, event);
      case "RedemptionStatusUpdated":
        return this.#recordRedemptionStatus(client, event);
    }
  }

  async #recordPurchase(client: PostgresQueryable, event: Extract<ProtocolEvent, { kind: "PackPurchased" }>): Promise<void> {
    await client.query(
      `INSERT INTO protocol_capsule_purchases (
         chain_id, purchase_id, drop_id, buyer_address, request_id, price_wei, status,
         purchase_transaction_hash, purchase_block_number, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW())
       ON CONFLICT (chain_id, purchase_id) DO NOTHING`,
      [
        event.chainId,
        event.purchaseId.toString(),
        event.dropId.toString(),
        event.buyer,
        event.requestId,
        event.price.toString(),
        event.transactionHash,
        event.blockNumber.toString()
      ]
    );
    const result = await client.query<{
      buyer_address: string;
      drop_id: string | number;
      price_wei: string;
      request_id: string;
    }>(
      `SELECT buyer_address, drop_id, price_wei, request_id
       FROM protocol_capsule_purchases WHERE chain_id = $1 AND purchase_id = $2`,
      [event.chainId, event.purchaseId.toString()]
    );
    const row = result.rows[0];
    if (
      row === undefined
      || row.buyer_address.toLowerCase() !== event.buyer.toLowerCase()
      || String(row.drop_id) !== event.dropId.toString()
      || row.price_wei !== event.price.toString()
      || row.request_id.toLowerCase() !== event.requestId.toLowerCase()
    ) {
      throw new Error(`Conflicting indexed purchase ${event.purchaseId}`);
    }
  }

  async #recordReveal(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "PackRevealed" }>
  ): Promise<InventoryReconciliationAction> {
    const updated = await client.query(
      `UPDATE protocol_capsule_purchases
          SET status = 'revealed', reveal_transaction_hash = $1, reveal_block_number = $2,
              inventory_id = $3, token_id = $4, updated_at = NOW()
        WHERE chain_id = $5 AND purchase_id = $6 AND LOWER(buyer_address) = LOWER($7)`,
      [
        event.transactionHash,
        event.blockNumber.toString(),
        event.inventoryId,
        event.tokenId.toString(),
        event.chainId,
        event.purchaseId.toString(),
        event.buyer
      ]
    );
    if (updated.rowCount !== 1) throw new Error(`PackRevealed has no indexed purchase ${event.purchaseId}`);
    await this.#upsertInventoryState(client, event, {
      inventoryId: event.inventoryId,
      ownerAddress: event.buyer,
      status: "user_owned",
      tokenId: event.tokenId.toString()
    });
    return this.#action(event.inventoryId, "user_owned", event);
  }

  async #recordRefund(client: PostgresQueryable, event: Extract<ProtocolEvent, { kind: "PackRefunded" }>): Promise<void> {
    const updated = await client.query(
      `UPDATE protocol_capsule_purchases
          SET status = 'refunded', refund_transaction_hash = $1, refund_block_number = $2, updated_at = NOW()
        WHERE chain_id = $3 AND purchase_id = $4 AND LOWER(buyer_address) = LOWER($5)`,
      [event.transactionHash, event.blockNumber.toString(), event.chainId, event.purchaseId.toString(), event.buyer]
    );
    if (updated.rowCount !== 1) throw new Error(`PackRefunded has no indexed purchase ${event.purchaseId}`);
  }

  async #recordListing(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "ListingCreated" }>
  ): Promise<InventoryReconciliationAction> {
    const inventory = await this.#inventoryByToken(client, event.chainId, event.tokenId.toString());
    await client.query(
      `INSERT INTO marketplace_listing_state (
         chain_id, listing_id, inventory_id, token_id, seller_address, amount, price_wei,
         status, transaction_hash, block_number, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, NOW())
       ON CONFLICT (chain_id, listing_id) DO NOTHING`,
      [
        event.chainId,
        event.listingId.toString(),
        inventory.inventory_id,
        event.tokenId.toString(),
        event.seller,
        event.amount.toString(),
        event.price.toString(),
        event.transactionHash,
        event.blockNumber.toString()
      ]
    );
    const stored = await this.#listing(client, event.chainId, event.listingId);
    if (
      stored.inventory_id !== inventory.inventory_id
      || stored.token_id !== event.tokenId.toString()
      || stored.seller_address.toLowerCase() !== event.seller.toLowerCase()
      || stored.amount !== event.amount.toString()
      || stored.price_wei !== event.price.toString()
    ) {
      throw new Error(`Conflicting indexed listing ${event.listingId}`);
    }
    await this.#upsertInventoryState(client, event, {
      activeListingId: event.listingId,
      inventoryId: inventory.inventory_id,
      ownerAddress: event.seller,
      status: "listed",
      tokenId: event.tokenId.toString()
    });
    return this.#action(inventory.inventory_id, "listed", event);
  }

  async #recordListingCancellation(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "ListingCancelled" }>
  ): Promise<InventoryReconciliationAction> {
    const listing = await this.#listing(client, event.chainId, event.listingId);
    if (listing.seller_address.toLowerCase() !== event.seller.toLowerCase()) {
      throw new Error(`Listing ${event.listingId} seller mismatch`);
    }
    await client.query(
      `UPDATE marketplace_listing_state
          SET status = 'cancelled', transaction_hash = $1, block_number = $2, updated_at = NOW()
        WHERE chain_id = $3 AND listing_id = $4`,
      [event.transactionHash, event.blockNumber.toString(), event.chainId, event.listingId.toString()]
    );
    await this.#upsertInventoryState(client, event, {
      inventoryId: listing.inventory_id,
      ownerAddress: event.seller,
      status: "user_owned",
      tokenId: listing.token_id
    });
    return this.#action(listing.inventory_id, "user_owned", event);
  }

  async #recordListingSale(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "ListingSold" }>
  ): Promise<InventoryReconciliationAction> {
    const listing = await this.#listing(client, event.chainId, event.listingId);
    await client.query(
      `UPDATE marketplace_listing_state
          SET status = 'sold', buyer_address = $1, price_wei = $2, fee_wei = $3,
              transaction_hash = $4, block_number = $5, updated_at = NOW()
        WHERE chain_id = $6 AND listing_id = $7`,
      [
        event.buyer,
        event.price.toString(),
        event.fee.toString(),
        event.transactionHash,
        event.blockNumber.toString(),
        event.chainId,
        event.listingId.toString()
      ]
    );
    await this.#upsertInventoryState(client, event, {
      inventoryId: listing.inventory_id,
      ownerAddress: event.buyer,
      status: "user_owned",
      tokenId: listing.token_id
    });
    return this.#action(listing.inventory_id, "user_owned", event);
  }

  async #recordRedemption(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "RedemptionRequested" }>
  ): Promise<InventoryReconciliationAction> {
    const inventory = await this.#inventoryByToken(client, event.chainId, event.tokenId.toString());
    await client.query(
      `INSERT INTO redemption_request_state (
         chain_id, request_id, inventory_id, token_id, requester_address, status,
         transaction_hash, block_number, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'requested', $6, $7, NOW())
       ON CONFLICT (chain_id, request_id) DO NOTHING`,
      [
        event.chainId,
        event.requestId.toString(),
        inventory.inventory_id,
        event.tokenId.toString(),
        event.requester,
        event.transactionHash,
        event.blockNumber.toString()
      ]
    );
    await this.#upsertInventoryState(client, event, {
      activeRedemptionRequestId: event.requestId,
      inventoryId: inventory.inventory_id,
      ownerAddress: event.requester,
      status: "redemption_pending",
      tokenId: event.tokenId.toString()
    });
    return this.#action(inventory.inventory_id, "redemption_pending", event);
  }

  async #recordRedemptionStatus(
    client: PostgresQueryable,
    event: Extract<ProtocolEvent, { kind: "RedemptionStatusUpdated" }>
  ): Promise<InventoryReconciliationAction> {
    const request = await this.#redemption(client, event.chainId, event.requestId);
    const status = redemptionStatusName(event.status);
    const previousStatus = redemptionStatusName(event.previousStatus);
    if (request.status !== previousStatus && request.status !== status) {
      throw new Error(
        `Redemption request ${event.requestId} status mismatch: indexed ${request.status}, event expected ${previousStatus}`
      );
    }
    await client.query(
      `UPDATE redemption_request_state
          SET status = $1, transaction_hash = $2, block_number = $3, updated_at = NOW()
        WHERE chain_id = $4 AND request_id = $5`,
      [status, event.transactionHash, event.blockNumber.toString(), event.chainId, event.requestId.toString()]
    );
    const targetStatus: InventoryStatus = status === "completed"
      ? "redeemed"
      : status === "cancelled"
        ? "user_owned"
        : "redemption_pending";
    await this.#upsertInventoryState(client, event, {
      ...(targetStatus === "redemption_pending" ? { activeRedemptionRequestId: event.requestId } : {}),
      inventoryId: request.inventory_id,
      ownerAddress: targetStatus === "redeemed" ? null : getAddress(request.requester_address),
      status: targetStatus,
      tokenId: request.token_id
    });
    return this.#action(request.inventory_id, targetStatus, event);
  }

  async #inventoryByToken(client: PostgresQueryable, chainId: number, tokenId: string): Promise<InventoryChainRow> {
    const result = await client.query<InventoryChainRow>(
      `SELECT inventory_id, owner_address, token_id
       FROM inventory_chain_state WHERE chain_id = $1 AND token_id = $2`,
      [chainId, tokenId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`No indexed inventory for token ${tokenId}`);
    return row;
  }

  async #listing(client: PostgresQueryable, chainId: number, listingId: bigint): Promise<ListingRow> {
    const result = await client.query<ListingRow>(
      `SELECT inventory_id, seller_address, token_id, amount, price_wei, status
       FROM marketplace_listing_state WHERE chain_id = $1 AND listing_id = $2`,
      [chainId, listingId.toString()]
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`No indexed listing ${listingId}`);
    return row;
  }

  async #redemption(client: PostgresQueryable, chainId: number, requestId: bigint): Promise<RedemptionRow> {
    const result = await client.query<RedemptionRow>(
      `SELECT inventory_id, requester_address, token_id, status
       FROM redemption_request_state WHERE chain_id = $1 AND request_id = $2`,
      [chainId, requestId.toString()]
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`No indexed redemption request ${requestId}`);
    return row;
  }

  async #upsertInventoryState(
    client: PostgresQueryable,
    event: ProtocolEvent,
    state: {
      activeListingId?: bigint;
      activeRedemptionRequestId?: bigint;
      inventoryId: string;
      ownerAddress: Address | null;
      status: InventoryStatus;
      tokenId: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO inventory_chain_state (
         chain_id, inventory_id, token_id, owner_address, custody_status,
         active_listing_id, active_redemption_request_id, last_transaction_hash,
         last_log_index, last_block_number, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (chain_id, inventory_id) DO UPDATE SET
         token_id = EXCLUDED.token_id,
         owner_address = EXCLUDED.owner_address,
         custody_status = EXCLUDED.custody_status,
         active_listing_id = EXCLUDED.active_listing_id,
         active_redemption_request_id = EXCLUDED.active_redemption_request_id,
         last_transaction_hash = EXCLUDED.last_transaction_hash,
         last_log_index = EXCLUDED.last_log_index,
         last_block_number = EXCLUDED.last_block_number,
         updated_at = NOW()`,
      [
        event.chainId,
        state.inventoryId,
        state.tokenId,
        state.ownerAddress,
        state.status,
        state.activeListingId?.toString() ?? null,
        state.activeRedemptionRequestId?.toString() ?? null,
        event.transactionHash,
        event.logIndex,
        event.blockNumber.toString()
      ]
    );
  }

  #action(inventoryId: string, targetStatus: InventoryStatus, event: ProtocolEvent): InventoryReconciliationAction {
    return {
      inventoryId,
      targetStatus,
      chainEvidence: {
        blockNumber: event.blockNumber.toString(),
        chainId: event.chainId,
        contractAddress: event.contractAddress,
        eventName: event.kind,
        logIndex: event.logIndex,
        transactionHash: event.transactionHash
      }
    };
  }

  async #transaction<T>(operation: (client: PostgresTransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
