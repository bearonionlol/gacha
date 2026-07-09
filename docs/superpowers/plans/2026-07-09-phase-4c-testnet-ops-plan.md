# Phase 4C Testnet Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a testnet operations layer with known-inventory token lookup, pack reveal writes, redemption admin writes, and a precise operator runbook.

**Architecture:** Extend the existing direct EIP-1193 plus viem contract boundary instead of adding a wallet framework or indexer. Token lookup scans seeded inventory candidates only; transaction panels continue to use explicit user clicks and the shared `TransactionActionPanel`.

**Tech Stack:** Next.js App Router, React client components, TypeScript, viem ABI fragments, Vitest, Testing Library, jsdom, Hardhat contracts.

---

## Scope

Implement against `docs/superpowers/specs/2026-07-09-phase-4c-testnet-ops-design.md`.

Do not add:

- server signing, relayers, or session keys
- mainnet writes
- indexer-backed full inventory
- inventory anchoring/drop creation admin writes
- buyback or treasury panels

## File Map

- Modify `apps/web/src/lib/contracts/abis.ts`: add `InventoryRegistry.derivePhysicalTokenId`, `ItemToken.tokenKind`, `ItemToken.uri`, `PackSale.reveal`, and redemption admin function fragments.
- Modify `apps/web/src/lib/contracts/transactions.ts`: add write variants and prepared write handling for pack reveal and redemption admin operations.
- Modify `apps/web/src/lib/contracts/transaction-config.ts`: add request builders and input parsers for purchase IDs, request IDs, tracking references, and cancellation reasons.
- Create `apps/web/src/lib/contracts/known-inventory-tokens.ts`: seeded inventory ownership scan helper.
- Create `apps/web/src/lib/contracts/__tests__/known-inventory-tokens.test.ts`: scanner unit tests.
- Modify `apps/web/src/lib/contracts/__tests__/transactions.test.ts` and `transaction-config.test.ts`: request builder coverage.
- Create `apps/web/src/components/known-inventory-token-picker.tsx`: wallet-triggered scanner UI.
- Modify `apps/web/src/components/testnet-write-panels.tsx`: integrate token picker and add pack reveal/redemption ops panels.
- Modify `apps/web/src/components/reveal-panel.tsx`: replace Phase 4A guard with `PackRevealPanel`.
- Modify `apps/web/src/components/admin-inventory-console.tsx`: add `RedemptionOpsPanel` and operations checklist.
- Modify route/component tests under `apps/web/src/components/__tests__`.
- Modify `apps/web/src/app/globals.css`: style picker and ops controls.
- Modify `docs/testnet-runbook.md`: add Phase 4C operator smoke path.

## Task 1: Transaction Surface Expansion

**Files:**
- Modify: `apps/web/src/lib/contracts/abis.ts`
- Modify: `apps/web/src/lib/contracts/transactions.ts`
- Modify: `apps/web/src/lib/contracts/transaction-config.ts`
- Test: `apps/web/src/lib/contracts/__tests__/transactions.test.ts`
- Test: `apps/web/src/lib/contracts/__tests__/transaction-config.test.ts`

- [ ] **Step 1: Write failing transaction helper tests**

Add tests that call:

```ts
createWriteRequest({ kind: "packReveal", contracts, purchaseId: 7n });
createWriteRequest({ kind: "redemptionMarkShipped", contracts, requestId: 3n, trackingRef: "UPS-TEST-1" });
createWriteRequest({ kind: "redemptionCancel", contracts, requestId: 4n, reason: "testnet operator cancellation" });
```

Expected prepared writes:

```ts
expect(reveal.address).toBe(contracts.PackSale);
expect(reveal.functionName).toBe("reveal");
expect(reveal.args).toEqual([7n]);
expect(ship.functionName).toBe("markShipped");
expect(ship.args).toEqual([3n, "UPS-TEST-1"]);
expect(cancel.functionName).toBe("cancel");
expect(cancel.args).toEqual([4n, "testnet operator cancellation"]);
```

- [ ] **Step 2: Write failing config tests**

Add tests for:

```ts
expect(parsePositiveActionId("12")).toBe(12n);
expect(parsePositiveActionId("0")).toBeNull();
expect(createPackRevealRequestForPurchase(contracts, null)).toBeNull();
expect(createPackRevealRequestForPurchase(contracts, 7n)).toEqual({ kind: "packReveal", contracts, purchaseId: 7n });
expect(createRedemptionAdminRequest(contracts, { mode: "markShipped", requestId: 3n, trackingRef: "UPS-TEST-1", reason: "" })).toEqual({
  kind: "redemptionMarkShipped",
  contracts,
  requestId: 3n,
  trackingRef: "UPS-TEST-1"
});
```

- [ ] **Step 3: Run RED command**

Run:

```bash
pnpm --filter @gacha/web test -- transactions transaction-config
```

Expected: fail because the new functions and union variants do not exist.

- [ ] **Step 4: Implement minimal helper support**

Add ABI fragments:

```ts
{ type: "function", name: "reveal", stateMutability: "nonpayable", inputs: [{ name: "purchaseId", type: "uint256" }], outputs: [{ name: "tokenId", type: "uint256" }] }
{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }], outputs: [] }
{ type: "function", name: "markPacked", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }], outputs: [] }
{ type: "function", name: "markShipped", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }, { name: "trackingRef", type: "string" }], outputs: [] }
{ type: "function", name: "complete", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }], outputs: [] }
{ type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }, { name: "reason", type: "string" }], outputs: [] }
```

Add `WriteRequest` variants:

```ts
| { kind: "packReveal"; contracts: ProtocolContracts; purchaseId: bigint }
| { kind: "redemptionApprove"; contracts: ProtocolContracts; requestId: bigint }
| { kind: "redemptionMarkPacked"; contracts: ProtocolContracts; requestId: bigint }
| { kind: "redemptionMarkShipped"; contracts: ProtocolContracts; requestId: bigint; trackingRef: string }
| { kind: "redemptionComplete"; contracts: ProtocolContracts; requestId: bigint }
| { kind: "redemptionCancel"; contracts: ProtocolContracts; requestId: bigint; reason: string }
```

Add request builders in `transaction-config.ts`:

```ts
export type RedemptionAdminMode = "approve" | "markPacked" | "markShipped" | "complete" | "cancel";
export function parsePositiveActionId(value: string): bigint | null;
export function createPackRevealRequestForPurchase(contracts: ProtocolContracts, purchaseId: bigint | null): WriteRequest | null;
export function createRedemptionAdminRequest(contracts: ProtocolContracts, input: RedemptionAdminRequestInput): WriteRequest | null;
```

- [ ] **Step 5: Run GREEN command**

Run:

```bash
pnpm --filter @gacha/web test -- transactions transaction-config
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/contracts/abis.ts apps/web/src/lib/contracts/transactions.ts apps/web/src/lib/contracts/transaction-config.ts apps/web/src/lib/contracts/__tests__/transactions.test.ts apps/web/src/lib/contracts/__tests__/transaction-config.test.ts
git commit -m "feat: add phase 4c transaction requests"
```

## Task 2: Known Inventory Token Scanner

**Files:**
- Create: `apps/web/src/lib/contracts/known-inventory-tokens.ts`
- Create: `apps/web/src/lib/contracts/__tests__/known-inventory-tokens.test.ts`

- [ ] **Step 1: Write failing scanner tests**

Create tests with a fake `ProtocolReadClient` that returns:

```ts
derivePhysicalTokenId("inv-sample-pkm-raw-001") -> 1001n
balanceOf(account, 1001n) -> 1n
balanceOf(account, otherTokenIds) -> 0n
```

Assert:

```ts
const result = await readKnownInventoryTokenStates({ account, contracts, client });
expect(result.status).toBe("ready");
expect(result.tokens).toHaveLength(1);
expect(result.tokens[0]).toMatchObject({
  inventoryId: "inv-sample-pkm-raw-001",
  tokenId: 1001n,
  balance: 1n,
  redeemable: true
});
```

Add an RPC failure test:

```ts
const result = await readKnownInventoryTokenStates({ account, contracts, client: failingClient });
expect(result.status).toBe("degraded");
expect(result.message).not.toContain("secret");
```

- [ ] **Step 2: Run RED command**

```bash
pnpm --filter @gacha/web test -- known-inventory-tokens
```

Expected: fail because the file does not exist.

- [ ] **Step 3: Implement scanner**

Create:

```ts
export type KnownInventoryToken = {
  inventoryId: string;
  title: string;
  subtitle: string;
  tokenId: bigint;
  balance: bigint;
  redeemable: boolean;
  grailTier: string;
};

export type KnownInventoryTokenScan =
  | { status: "ready"; message: string; tokens: KnownInventoryToken[] }
  | { status: "empty"; message: string; tokens: [] }
  | { status: "degraded"; message: string; tokens: [] };
```

Read token IDs through `InventoryRegistry.derivePhysicalTokenId` and balances through `ItemToken.balanceOf`. Return only candidates with `balance > 0n`.

- [ ] **Step 4: Run GREEN command**

```bash
pnpm --filter @gacha/web test -- known-inventory-tokens
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/contracts/known-inventory-tokens.ts apps/web/src/lib/contracts/__tests__/known-inventory-tokens.test.ts
git commit -m "feat: add known inventory token scanner"
```

## Task 3: Token Picker UI

**Files:**
- Create: `apps/web/src/components/known-inventory-token-picker.tsx`
- Modify: `apps/web/src/components/testnet-write-panels.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Update market/redemption route tests to expect:

```ts
expect(screen.getAllByText(/Scan wallet inventory/i).length).toBeGreaterThan(0);
expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
```

Add a component test if needed to assert no account request on render:

```ts
const request = vi.fn();
render(<KnownInventoryTokenPicker contracts={contracts} onSelectTokenId={vi.fn()} />);
expect(request).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run RED command**

```bash
pnpm --filter @gacha/web test -- vault-market-redemption known-inventory-token-picker
```

Expected: fail because picker UI is not present.

- [ ] **Step 3: Implement picker and integrate panels**

`KnownInventoryTokenPicker` must:

- show "Scan wallet inventory" before connection
- request accounts only on click
- read chain ID and reject non-testnet with copy
- call `readKnownInventoryTokenStates`
- render owned token cards with "Use token"
- call `onSelectTokenId(token.tokenId)` when selected

`MarketplaceListPanel` and `RedemptionRequestPanel` pass `setTokenIdInput(tokenId.toString())`.

- [ ] **Step 4: Run GREEN command**

```bash
pnpm --filter @gacha/web test -- vault-market-redemption known-inventory-token-picker
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/known-inventory-token-picker.tsx apps/web/src/components/testnet-write-panels.tsx apps/web/src/app/globals.css apps/web/src/components/__tests__/vault-market-redemption.test.tsx
git commit -m "feat: add seeded inventory token picker"
```

## Task 4: Reveal and Redemption Operations Panels

**Files:**
- Modify: `apps/web/src/components/testnet-write-panels.tsx`
- Modify: `apps/web/src/components/reveal-panel.tsx`
- Modify: `apps/web/src/components/admin-inventory-console.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/__tests__/dashboard.test.tsx`
- Test: `apps/web/src/components/__tests__/forge-admin.test.tsx`

- [ ] **Step 1: Write failing route tests**

Dashboard test expects:

```ts
expect(screen.getByText(/Reveal purchase on testnet/i)).toBeInTheDocument();
expect(screen.getByLabelText(/Purchase ID/i)).toBeInTheDocument();
expect(screen.getAllByText(/PackSale\.reveal/i).length).toBeGreaterThan(0);
```

Admin test expects:

```ts
expect(screen.getByText(/Redemption operations/i)).toBeInTheDocument();
expect(screen.getByLabelText(/Request ID/i)).toBeInTheDocument();
expect(screen.getByLabelText(/Operation mode/i)).toBeInTheDocument();
expect(screen.getByText(/REDEMPTION_ADMIN_ROLE/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run RED command**

```bash
pnpm --filter @gacha/web test -- dashboard forge-admin
```

Expected: fail because Phase 4C panels are not rendered.

- [ ] **Step 3: Implement panels**

Add `PackRevealPanel` with:

- purchase ID input
- `actionDisabledReason` when missing
- summary rows for `PackSale.reveal` and purchase ID
- `writeRequest={(contracts) => createPackRevealRequestForPurchase(contracts, purchaseId)}`

Add `RedemptionOpsPanel` with:

- mode select: approve, markPacked, markShipped, complete, cancel
- request ID input
- tracking reference input shown/required for markShipped
- cancellation reason input shown/required for cancel
- `writeRequest={(contracts) => createRedemptionAdminRequest(contracts, input)}`

- [ ] **Step 4: Run GREEN command**

```bash
pnpm --filter @gacha/web test -- dashboard forge-admin
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/testnet-write-panels.tsx apps/web/src/components/reveal-panel.tsx apps/web/src/components/admin-inventory-console.tsx apps/web/src/app/globals.css apps/web/src/components/__tests__/dashboard.test.tsx apps/web/src/components/__tests__/forge-admin.test.tsx
git commit -m "feat: add phase 4c operations panels"
```

## Task 5: Runbook and Full Verification

**Files:**
- Modify: `docs/testnet-runbook.md`

- [ ] **Step 1: Update runbook**

Add a "Phase 4C Web Operations Smoke" section with this sequence:

```bash
pnpm --filter @gacha/contracts deploy:testnet
pnpm --filter @gacha/contracts seed:testnet
pnpm --filter @gacha/contracts smoke:testnet
pnpm --filter @gacha/web dev --port 64920
```

Document browser flow:

1. Connect wallet on Robinhood Chain Testnet.
2. Reserve pack.
3. Reveal purchase ID after randomness is ready.
4. Scan known seeded inventory in Market or Redemption.
5. Approve and list/redeem selected token.
6. Use admin redemption ops only from a role-bearing operator wallet.

- [ ] **Step 2: Run full verification**

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Expected: all commands pass.

- [ ] **Step 3: Browser QA**

Run dev server on `64920` and check `/`, `/vault`, `/market`, `/forge`, `/redemption`, and `/admin/inventory` at `1440x1000` and `390x844`.

Expected:

- every route renders a main landmark
- no runtime error text
- no horizontal overflow
- Phase 4C panels visible on dashboard, market, redemption, and admin routes
- no wallet account request on page load

- [ ] **Step 4: Commit**

```bash
git add docs/testnet-runbook.md
git commit -m "docs: add phase 4c testnet operations runbook"
```
