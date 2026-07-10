import { describe, expect, it } from "vitest";

import { createPhotoHash } from "../photo-hash";
import {
  InMemoryInventoryRepository,
  InventoryConflictError,
  InventoryMutationForbiddenError,
  type InventoryActor
} from "../repository";
import { sampleInventory } from "../sample-inventory";

const actor: InventoryActor = {
  requestId: "request-1",
  role: "inventory_manager",
  walletAddress: "0x1111111111111111111111111111111111111111"
};

describe("InventoryRepository contract", () => {
  it("increments optimistic revisions and records append-only audit events", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const original = await repository.get(sampleInventory[0]!.inventoryId);
    expect(original?.revision).toBe(1);

    const updated = await repository.update(
      {
        ...original!.item,
        conditionNotes: "Reviewed under direct light.",
        updatedAt: "2026-07-10T12:00:00.000Z"
      },
      original!.revision,
      actor
    );

    expect(updated.revision).toBe(2);
    await expect(repository.update(updated.item, 1, actor)).rejects.toBeInstanceOf(InventoryConflictError);
    expect(await repository.listAudit({ inventoryId: updated.item.inventoryId })).toEqual([
      expect.objectContaining({ action: "inventory.updated", inventoryId: updated.item.inventoryId, revision: 2 })
    ]);
  });

  it("applies lifecycle rules and audits the before and after states", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const original = await repository.get("inv-sample-pkm-raw-001");
    const transitioned = await repository.transition(original!.item.inventoryId, "vaulted", 1, actor);

    expect(transitioned.item.custodyStatus).toBe("vaulted");
    expect(transitioned.revision).toBe(2);
    expect(await repository.listAudit({ inventoryId: original!.item.inventoryId })).toEqual([
      expect.objectContaining({
        action: "inventory.transitioned",
        metadata: expect.objectContaining({ from: "verified", to: "vaulted" })
      })
    ]);
  });

  it("keeps bulk creates atomic when any ID conflicts", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const first = {
      ...sampleInventory[0]!,
      inventoryId: "inv-bulk-new",
      photoUrls: ["https://assets.example.com/new-front.jpg"],
      photoHash: createPhotoHash(["https://assets.example.com/new-front.jpg"])
    };

    await expect(repository.bulkCreate([first, sampleInventory[1]!], actor)).rejects.toBeInstanceOf(InventoryConflictError);
    expect(await repository.get(first.inventoryId)).toBeNull();
  });

  it("only permits revision-matched draft deletion", async () => {
    const draft = {
      ...sampleInventory[0]!,
      inventoryId: "inv-draft-delete",
      custodyStatus: "draft" as const,
      dropEligibility: false,
      tierPoolEligible: false,
      photoUrls: ["https://assets.example.com/draft-front.jpg"],
      photoHash: createPhotoHash(["https://assets.example.com/draft-front.jpg"])
    };
    const repository = new InMemoryInventoryRepository([draft, sampleInventory[0]!]);

    await expect(repository.delete(sampleInventory[0]!.inventoryId, 1, actor)).rejects.toBeInstanceOf(
      InventoryMutationForbiddenError
    );
    await repository.delete(draft.inventoryId, 1, actor);

    expect(await repository.get(draft.inventoryId)).toBeNull();
    expect(await repository.listAudit({ inventoryId: draft.inventoryId })).toEqual([
      expect.objectContaining({ action: "inventory.deleted", revision: 1 })
    ]);
  });

  it("filters inventory without returning mutable repository state", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const results = await repository.list({ brand: "pokemon", search: "lugia" });

    expect(results).toHaveLength(1);
    expect(results[0]?.item.inventoryId).toBe("inv-sample-graded-001");
    results[0]!.item.cardName = "mutated client copy";
    expect((await repository.get("inv-sample-graded-001"))?.item.cardName).not.toBe("mutated client copy");
  });

  it("queues a revision exactly once for multisig execution", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const record = await repository.get("inv-sample-graded-001");
    const first = await repository.queueOnchainOperation(
      record!.item.inventoryId,
      "publish_drop",
      record!.revision,
      actor,
      "0x2222222222222222222222222222222222222222"
    );
    const replay = await repository.queueOnchainOperation(
      record!.item.inventoryId,
      "publish_drop",
      record!.revision,
      actor,
      "0x2222222222222222222222222222222222222222"
    );

    expect(replay.operationId).toBe(first.operationId);
    expect(await repository.listOnchainOperations(record!.item.inventoryId)).toHaveLength(1);
    expect(await repository.listAudit({ inventoryId: record!.item.inventoryId })).toHaveLength(1);
  });
});
