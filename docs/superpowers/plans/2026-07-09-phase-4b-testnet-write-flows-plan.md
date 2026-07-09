# Phase 4B Testnet Write Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Robinhood Chain testnet wallet write flows for pack reservation, marketplace listing, Forge crafting, and redemption requests.

**Architecture:** Keep contracts unchanged and add a small web transaction boundary around the existing EIP-1193 wallet and viem public client. Reuse one transaction panel lifecycle across feature-specific panels so wallet prompts, errors, receipts, and explorer links behave consistently.

**Tech Stack:** Next.js App Router, React 18 client components, TypeScript, viem, Vitest, Testing Library, jsdom, deployed Robinhood testnet registry.

---

## Source Spec

Implement against `docs/superpowers/specs/2026-07-09-phase-4b-testnet-write-flows-design.md`.

Important constraints:

- Never expose `DEPLOYER_PRIVATE_KEY` or private env values.
- Never request wallet accounts or send transactions on page load.
- Keep writes Robinhood Chain testnet-only.
- Every transaction requires an explicit user click.
- No server signing, relayer, gas sponsorship, or mainnet writes.

## File Structure

- Modify `apps/web/src/lib/contracts/abis.ts`: add minimal write ABI entries.
- Create `apps/web/src/lib/contracts/transaction-config.ts`: public testnet action descriptors.
- Create `apps/web/src/lib/contracts/transactions.ts`: wallet-client, write, receipt, explorer, and error helpers.
- Create `apps/web/src/lib/contracts/__tests__/transactions.test.ts`: transaction helper tests.
- Create `apps/web/src/components/transaction-action-panel.tsx`: reusable client transaction lifecycle panel.
- Create `apps/web/src/components/testnet-write-panels.tsx`: pack, marketplace, Forge, and redemption wrappers.
- Create `apps/web/src/components/__tests__/transaction-action-panel.test.tsx`: panel behavior tests.
- Modify `apps/web/src/components/drop-lobby.tsx`: replace pack guard with pack purchase panel.
- Modify `apps/web/src/components/market-board.tsx`: replace list guard with marketplace list panel.
- Modify `apps/web/src/components/forge-workbench.tsx`: replace craft guard with Forge craft panel.
- Modify `apps/web/src/components/redemption-timeline.tsx`: replace redemption guard with redemption request panel.
- Modify `apps/web/src/components/__tests__/dashboard.test.tsx`: update Phase 4B dashboard expectations.
- Modify `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`: update market and redemption expectations.
- Modify `apps/web/src/components/__tests__/forge-admin.test.tsx`: update Forge expectations.
- Modify `apps/web/src/app/globals.css`: style transaction panels and states.

## Task 1: Transaction Helper Boundary

- [ ] **Step 1: Write failing helper tests**

Create `apps/web/src/lib/contracts/__tests__/transactions.test.ts` with tests that assert:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";
import {
  buildExplorerTxUrl,
  createWriteRequest,
  formatTransactionHash,
  getTransactionErrorMessage,
  waitForTransactionReceipt
} from "../transactions";
import { robinhoodTestnetChainId } from "../wallet";

const contracts = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee" as Address,
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d" as Address,
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113" as Address,
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba" as Address,
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C" as Address,
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0" as Address,
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B" as Address,
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451" as Address
};

describe("transaction helpers", () => {
  it("builds a pack purchase request with value", () => {
    const request = createWriteRequest({
      kind: "packPurchase",
      contracts,
      dropId: 1n,
      value: 9_000_000_000_000_000n
    });

    expect(request.address).toBe(contracts.PackSale);
    expect(request.functionName).toBe("purchase");
    expect(request.args).toEqual([1n]);
    expect(request.value).toBe(9_000_000_000_000_000n);
  });

  it("builds marketplace approval and list requests", () => {
    expect(
      createWriteRequest({ kind: "approval", contracts, operator: "Marketplace", approved: true }).args
    ).toEqual([contracts.Marketplace, true]);

    const list = createWriteRequest({
      kind: "marketList",
      contracts,
      tokenId: 1001n,
      amount: 1n,
      price: 15_000_000_000_000_000n
    });

    expect(list.address).toBe(contracts.Marketplace);
    expect(list.functionName).toBe("list");
    expect(list.args).toEqual([1001n, 1n, 15_000_000_000_000_000n]);
  });

  it("sanitizes common wallet errors", () => {
    expect(getTransactionErrorMessage(Object.assign(new Error("rejected"), { code: 4001 }))).toMatch(/rejected/i);
    expect(getTransactionErrorMessage(new Error("insufficient funds for gas * price + value"))).toMatch(/enough testnet ETH/i);
    expect(getTransactionErrorMessage({})).toMatch(/failed/i);
  });

  it("formats hashes and explorer URLs", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    expect(formatTransactionHash(hash)).toBe("0x1234...cdef");
    expect(buildExplorerTxUrl(hash)).toContain(hash);
    expect(robinhoodTestnetChainId).toBe(46630);
  });

  it("waits for receipts through the supplied client", async () => {
    const receipt = { blockNumber: 12n, status: "success", transactionHash: "0xabc" as Hash };
    const client = { waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt) };

    await expect(waitForTransactionReceipt(client, "0xabc" as Hash)).resolves.toBe(receipt);
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xabc", timeout: 60_000 });
  });
});
```

Run:

```bash
pnpm --filter @gacha/web test -- transactions
```

Expected: FAIL because `transactions.ts` does not exist.

- [ ] **Step 2: Implement helper boundary**

Add write ABI entries in `apps/web/src/lib/contracts/abis.ts`:

```ts
// Add purchase to packSaleAbi, setApprovalForAll to itemTokenAbi,
// list to marketplaceAbi, craft to forgeAbi, requestRedemption to redemptionRegistryAbi.
```

Create `apps/web/src/lib/contracts/transactions.ts` with:

```ts
import type { Abi, Address, Hash, TransactionReceipt } from "viem";
import { createWalletClient, custom } from "viem";
import { robinhoodChainTestnet } from "@gacha/shared";
import { forgeAbi, itemTokenAbi, marketplaceAbi, packSaleAbi, redemptionRegistryAbi } from "./abis";
import type { ProtocolContracts, ProtocolContractName } from "./registry";
import type { Eip1193Provider } from "./wallet";

export type WriteRequest =
  | { kind: "packPurchase"; contracts: ProtocolContracts; dropId: bigint; value: bigint }
  | { kind: "approval"; contracts: ProtocolContracts; operator: Extract<ProtocolContractName, "Marketplace" | "Forge" | "RedemptionRegistry">; approved: boolean }
  | { kind: "marketList"; contracts: ProtocolContracts; tokenId: bigint; amount: bigint; price: bigint }
  | { kind: "forgeCraft"; contracts: ProtocolContracts; recipeId: bigint; value: bigint }
  | { kind: "redemptionRequest"; contracts: ProtocolContracts; tokenId: bigint };

export type PreparedWrite = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};

export function createWriteRequest(request: WriteRequest): PreparedWrite {
  if (request.kind === "packPurchase") {
    return { address: request.contracts.PackSale, abi: packSaleAbi as Abi, functionName: "purchase", args: [request.dropId], value: request.value };
  }

  if (request.kind === "approval") {
    return { address: request.contracts.ItemToken, abi: itemTokenAbi as Abi, functionName: "setApprovalForAll", args: [request.contracts[request.operator], request.approved] };
  }

  if (request.kind === "marketList") {
    return { address: request.contracts.Marketplace, abi: marketplaceAbi as Abi, functionName: "list", args: [request.tokenId, request.amount, request.price] };
  }

  if (request.kind === "forgeCraft") {
    return { address: request.contracts.Forge, abi: forgeAbi as Abi, functionName: "craft", args: [request.recipeId], value: request.value };
  }

  return { address: request.contracts.RedemptionRegistry, abi: redemptionRegistryAbi as Abi, functionName: "requestRedemption", args: [request.tokenId] };
}

export function createInjectedWalletClient(provider: Eip1193Provider) {
  return createWalletClient({ chain: robinhoodChainTestnet, transport: custom(provider) });
}

export async function sendPreparedWrite(provider: Eip1193Provider, account: Address, request: PreparedWrite): Promise<Hash> {
  return createInjectedWalletClient(provider).writeContract({ account, chain: robinhoodChainTestnet, ...request });
}

export type ReceiptClient = {
  waitForTransactionReceipt: (parameters: { hash: Hash; timeout?: number }) => Promise<TransactionReceipt>;
};

export function waitForTransactionReceipt(client: ReceiptClient, hash: Hash): Promise<TransactionReceipt> {
  return client.waitForTransactionReceipt({ hash, timeout: 60_000 });
}

export function formatTransactionHash(hash: Hash): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function buildExplorerTxUrl(hash: Hash): string {
  return `${robinhoodChainTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function getTransactionErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && Number((error as { code: unknown }).code) === 4001) {
    return "Transaction rejected in wallet.";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("insufficient funds")) {
    return "Wallet does not have enough testnet ETH for this action.";
  }

  return "Transaction failed or could not be confirmed. Review wallet details and retry.";
}
```

Run:

```bash
pnpm --filter @gacha/web test -- transactions
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/lib/contracts/abis.ts apps/web/src/lib/contracts/transactions.ts apps/web/src/lib/contracts/__tests__/transactions.test.ts
git commit -m "feat: add testnet transaction helpers"
```

## Task 2: Reusable Transaction Panel

- [ ] **Step 1: Write failing panel tests**

Create `apps/web/src/components/__tests__/transaction-action-panel.test.tsx` with tests that assert no provider calls on render, wallet connect happens only on click, send happens only on submit, confirmed receipt renders hash/block/explorer link, and rejected sends show sanitized retry copy.

Run:

```bash
pnpm --filter @gacha/web test -- transaction-action-panel
```

Expected: FAIL because `TransactionActionPanel` does not exist.

- [ ] **Step 2: Implement `TransactionActionPanel`**

Create `apps/web/src/components/transaction-action-panel.tsx` as a client component with props for title, summary, contracts, write request factory, optional approval request, and receipt client override for tests. The component must reuse the existing wallet helpers, never call the provider on render, submit only after clicks, show pending hash, confirmed receipt, explorer link, and sanitized errors.

Run:

```bash
pnpm --filter @gacha/web test -- transaction-action-panel
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/components/transaction-action-panel.tsx apps/web/src/components/__tests__/transaction-action-panel.test.tsx
git commit -m "feat: add reusable testnet transaction panel"
```

## Task 3: Feature Write Panels

- [ ] **Step 1: Write failing route tests**

Update dashboard, market/redemption, and Forge tests to expect Phase 4B write panel copy instead of Phase 4A guard copy:

- Dashboard: "Reserve pack on testnet" and "PackSale.purchase".
- Market: "Approve Marketplace" and "Marketplace.list".
- Forge: "Approve Forge" and "Forge.craft".
- Redemption: "Approve RedemptionRegistry" and "RedemptionRegistry.requestRedemption".

Run:

```bash
pnpm --filter @gacha/web test -- dashboard vault-market-redemption forge-admin
```

Expected: FAIL because routes still render Phase 4A guards.

- [ ] **Step 2: Implement feature panels**

Create `apps/web/src/lib/contracts/transaction-config.ts` with conservative sample testnet values:

```ts
export const testnetWriteConfig = {
  pack: { dropId: 1n, value: 9_000_000_000_000_000n },
  market: { tokenId: 1n, amount: 1n, price: 15_000_000_000_000_000n },
  forge: { recipeId: 1n, value: 1_500_000_000_000_000n },
  redemption: { tokenId: 1n }
} as const;
```

Create `apps/web/src/components/testnet-write-panels.tsx` with four wrappers around `TransactionActionPanel`.

Replace `ActionGuardPanel` imports/usages in drop, market, Forge, and redemption components with the relevant write panel.

Run:

```bash
pnpm --filter @gacha/web test -- dashboard vault-market-redemption forge-admin
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/lib/contracts/transaction-config.ts apps/web/src/components/testnet-write-panels.tsx apps/web/src/components/drop-lobby.tsx apps/web/src/components/market-board.tsx apps/web/src/components/forge-workbench.tsx apps/web/src/components/redemption-timeline.tsx apps/web/src/components/__tests__/dashboard.test.tsx apps/web/src/components/__tests__/vault-market-redemption.test.tsx apps/web/src/components/__tests__/forge-admin.test.tsx
git commit -m "feat: add phase 4b testnet write panels"
```

## Task 4: Styling and Verification

- [ ] **Step 1: Add transaction panel styles**

Update `apps/web/src/app/globals.css` with compact styles for `.transaction-panel`, `.transaction-state-row`, `.transaction-summary`, `.transaction-actions`, `.transaction-hash`, `.transaction-error`, and `.transaction-success`.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm --filter @gacha/web test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Expected: all pass.

- [ ] **Step 3: Browser QA**

Run the dev server on the existing local port if available, then verify `/`, `/market`, `/forge`, `/redemption`, `/vault`, and `/admin/inventory` at desktop and mobile widths. Confirm no horizontal overflow and no wallet prompt on page load.

Commit:

```bash
git add apps/web/src/app/globals.css
git commit -m "style: polish testnet transaction panels"
```
