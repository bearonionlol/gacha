vi.mock("server-only", () => ({}));

import {
  InMemoryInventoryRepository,
  InventoryMutationForbiddenError,
  createPhotoHash,
  sampleInventory,
  type InventoryActor
} from "@gacha/inventory";

import { AdminInventoryService } from "../inventory-service";

const actor: InventoryActor = {
  requestId: "request-test",
  role: "inventory_manager",
  walletAddress: "0x1111111111111111111111111111111111111111"
};

describe("AdminInventoryService", () => {
  it("forces single and bulk intake into off-chain ineligible drafts", async () => {
    const repository = new InMemoryInventoryRepository();
    const service = new AdminInventoryService(repository, () => new Date("2026-07-10T12:00:00.000Z"));
    const input = { ...sampleInventory[2]!, inventoryId: "inv-forced-draft" };
    const created = await service.create(input, actor);
    const bulkPhotoUrls = ["https://assets.example.com/bulk-front.jpg"];
    const [bulk] = await service.bulkCreate([{
      ...sampleInventory[0]!,
      inventoryId: "inv-bulk-draft",
      photoUrls: bulkPhotoUrls,
      photoHash: createPhotoHash(bulkPhotoUrls),
      custodyStatus: "redeemed",
      dropEligibility: true,
      tierPoolEligible: true,
      tradeInEligible: true
    }], actor);

    for (const record of [created, bulk!]) {
      expect(record.item.custodyStatus).toBe("draft");
      expect(record.item.dropEligibility).toBe(false);
      expect(record.item.tierPoolEligible).toBe(false);
      expect(record.item.tradeInEligible).toBe(false);
    }
  });

  it("rejects custody changes hidden inside ordinary metadata updates", async () => {
    const repository = new InMemoryInventoryRepository(sampleInventory);
    const service = new AdminInventoryService(repository);
    const record = await repository.get("inv-sample-pkm-raw-001");

    await expect(service.update(record!.item.inventoryId, {
      ...record!.item,
      custodyStatus: "drop_ready"
    }, record!.revision, actor)).rejects.toBeInstanceOf(InventoryMutationForbiddenError);
  });

  it("keeps indexed on-chain states read-only and blocks manual entry into them", async () => {
    const indexed = { ...sampleInventory[0]!, custodyStatus: "tokenized" as const };
    const repository = new InMemoryInventoryRepository([indexed, sampleInventory[2]!]);
    const service = new AdminInventoryService(repository);

    await expect(service.update(indexed.inventoryId, indexed, 1, actor)).rejects.toBeInstanceOf(InventoryMutationForbiddenError);
    await expect(service.transition(sampleInventory[2]!.inventoryId, "tokenized", 1, actor)).rejects.toBeInstanceOf(
      InventoryMutationForbiddenError
    );
  });

  it("rejects unsafe eligibility and incomplete custody advancement", async () => {
    const draft = {
      ...sampleInventory[0]!,
      inventoryId: "inv-incomplete-draft",
      custodyStatus: "draft" as const,
      dropEligibility: false,
      tierPoolEligible: false,
      tradeInEligible: false,
      photoUrls: [],
      photoHash: createPhotoHash([]),
      vaultLocationLabel: ""
    };
    const repository = new InMemoryInventoryRepository([draft]);
    const service = new AdminInventoryService(repository);

    await expect(service.update(draft.inventoryId, { ...draft, dropEligibility: true }, 1, actor)).rejects.toBeInstanceOf(
      InventoryMutationForbiddenError
    );
    await expect(service.transition(draft.inventoryId, "photographed", 1, actor)).rejects.toBeInstanceOf(
      InventoryMutationForbiddenError
    );
    await expect(service.transition(draft.inventoryId, "photographed", 1, actor, {
      allowSingleCustodyPhotoOnTestnet: true
    })).rejects.toBeInstanceOf(InventoryMutationForbiddenError);
    await expect(service.create({
      ...sampleInventory[0]!,
      inventoryId: "inv-unsafe-buyback",
      marketEstimateCents: 100,
      buybackQuoteCents: 200
    }, actor)).rejects.toBeInstanceOf(InventoryMutationForbiddenError);
  });

  it("allows and audits one sanitized photo only through the explicit testnet exception", async () => {
    const photoUrls = ["https://assets.example.com/op06-case-front.jpg"];
    const draft = {
      ...sampleInventory[0]!,
      inventoryId: "inv-testnet-single-photo",
      custodyStatus: "draft" as const,
      dropEligibility: false,
      tierPoolEligible: false,
      tradeInEligible: false,
      photoUrls,
      photoHash: createPhotoHash(photoUrls),
      vaultLocationLabel: "Private vault / OP06 case shelf",
      marketEstimateCents: 480_000
    };
    const repository = new InMemoryInventoryRepository([draft]);
    const service = new AdminInventoryService(repository);

    await expect(service.transition(draft.inventoryId, "photographed", 1, actor)).rejects.toBeInstanceOf(
      InventoryMutationForbiddenError
    );

    const photographed = await service.transition(draft.inventoryId, "photographed", 1, actor, {
      allowSingleCustodyPhotoOnTestnet: true
    });
    const verified = await service.transition(draft.inventoryId, "verified", photographed.revision, actor, {
      allowSingleCustodyPhotoOnTestnet: true
    });

    expect(verified.item.custodyStatus).toBe("verified");
    expect(await repository.listAudit({ inventoryId: draft.inventoryId })).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          custodyPhotoException: {
            environment: "robinhood_testnet",
            reason: "Explicit local Robinhood Chain testnet rehearsal using one sanitized custody photo."
          }
        })
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          custodyPhotoException: expect.objectContaining({ environment: "robinhood_testnet" })
        })
      })
    ]);
  });

  it("advances only through safe on-chain reconciliation paths", async () => {
    const repository = new InMemoryInventoryRepository([sampleInventory[2]!]);
    const service = new AdminInventoryService(repository);
    const evidence = {
      blockNumber: "89941842",
      chainId: 46630,
      contractAddress: "0x2222222222222222222222222222222222222222",
      eventName: "PackRevealed",
      logIndex: 4,
      transactionHash: `0x${"ab".repeat(32)}`
    };

    const owned = await service.reconcileOnchainStatus(sampleInventory[2]!.inventoryId, "user_owned", actor, evidence);
    expect(owned.item.custodyStatus).toBe("user_owned");
    expect(owned.item.dropEligibility).toBe(false);
    expect(owned.item.tierPoolEligible).toBe(false);
    expect(owned.revision).toBe(4);
    expect(await repository.listAudit({ inventoryId: sampleInventory[2]!.inventoryId })).toEqual([
      expect.objectContaining({
        action: "inventory.updated",
        metadata: expect.objectContaining({
          chainEvidence: evidence,
          reconciliation: "onchain_custody_normalization"
        })
      }),
      expect.objectContaining({ action: "inventory.transitioned" }),
      expect.objectContaining({ action: "inventory.transitioned" })
    ]);
    await expect(service.reconcileOnchainStatus(
      sampleInventory[2]!.inventoryId,
      "redeemed",
      actor,
      evidence
    )).rejects.toBeInstanceOf(InventoryMutationForbiddenError);
  });
});
