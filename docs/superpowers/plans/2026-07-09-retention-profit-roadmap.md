# Retention Profit Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the gacha super app into a testnet-ready, premium Robinhood Chain-native collector platform with creative Forge loops, protocol revenue controls, activity indexing, collection progression, marketplace liquidity, and public launch readiness.

**Architecture:** Ship one verified branch and merged PR per phase. Keep addictive loops ethical: transparent odds, explicit wallet actions, no hidden fee behavior, no deceptive scarcity, no real-security prize claims. Web behavior lives in focused `apps/web/src/lib` and `apps/web/src/components` modules; protocol constraints live in `packages/contracts/contracts` with matching Hardhat tests and testnet scripts.

**Tech Stack:** Next.js 14 app router, React 18, Vitest and Testing Library, Hardhat, Solidity, viem, Robinhood Chain testnet config, pnpm workspaces.

---

## File Map

- Modify `apps/web/src/components/forge-workbench.tsx` and `apps/web/src/components/forge-workbench-client.tsx` for Forge 2.0 recipe discovery, material placement, duplicate recycling, protected grail inputs, and live craft gating.
- Modify `apps/web/src/app/globals.css` for the premium Forge and later human design pass.
- Add or modify `apps/web/src/lib/economy.ts`, `apps/web/src/lib/activity-index.ts`, `apps/web/src/lib/collection-progression.ts`, and `apps/web/src/lib/marketplace.ts` for deterministic app state models.
- Modify `apps/web/src/lib/game-state.ts` so the dashboard, Forge, market, collection, and activity surfaces share the same product rules.
- Modify `apps/web/src/components/activity-feed.tsx`, `apps/web/src/components/status-rail.tsx`, `apps/web/src/components/market-board.tsx`, `apps/web/src/components/vault-grid.tsx`, and route pages as each phase expands.
- Modify `packages/contracts/contracts/Forge.sol`, `packages/contracts/contracts/Marketplace.sol`, and supporting tests only when revenue controls or market behavior need protocol enforcement.
- Modify `packages/contracts/scripts/deploy.ts`, `packages/contracts/scripts/seed.ts`, `packages/contracts/scripts/smoke.ts`, `docs/testnet-runbook.md`, and `docs/mainnet-migration-runbook.md` for public testnet readiness.

## Execution Rules

- Use branch prefix `codex/phase-N-short-name`.
- For every phase, write or update the failing test first, run the focused command to verify RED, implement, run focused tests to verify GREEN, then run the phase verification gate.
- After a phase passes, commit, push, open a ready PR, merge it into `main`, sync local `main`, and start the next phase.
- Preserve premium, human-written UI copy. Avoid language that sounds generated, overhyped, predatory, or legally careless.
- Keep all revenue mechanics explicit: fees, spreads, recycling values, marketplace fees, and expected protocol take must be visible before a user commits.

### Task 1: Phase 5 Forge 2.0 Creative Core

**Files:**
- Modify: `apps/web/src/components/forge-workbench.tsx`
- Create: `apps/web/src/components/forge-workbench-client.tsx`
- Modify: `apps/web/src/components/__tests__/forge-admin.test.tsx`
- Create: `apps/web/src/components/__tests__/forge-workbench.test.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Write the failing route and interaction tests**

```tsx
expect(screen.getByText(/Recipe Book/i)).toBeInTheDocument();
expect(screen.getByText(/Material bank/i)).toBeInTheDocument();
expect(screen.getByText(/3 x 3 Forge Grid/i)).toBeInTheDocument();
expect(screen.getByText(/Protocol fee preview/i)).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Load Fire Signal Upgrade/i }));
fireEvent.click(screen.getByRole("button", { name: /Add Fire shard/i }));
expect(screen.getByText(/Fire shard placed/i)).toBeInTheDocument();
```

- [x] **Step 2: Run RED command**

Run: `pnpm --filter @gacha/web test -- forge-admin forge-workbench`
Expected: FAIL before implementation because the interactive workbench, material bank, recipe loader, recycler, and live craft gating do not exist.

- [ ] **Step 3: Finish implementation and focused GREEN**

Use the client workbench for drag/click material placement, duplicate recycling, protected grail slots, recipe discovery cards, output preview, protocol fee preview, and testnet write panel handoff.

Run: `pnpm --filter @gacha/web test -- forge-admin forge-workbench`
Expected: PASS.

- [ ] **Step 4: Phase 5 verification gate**

Run:
```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
git diff --check
```

Expected: all commands exit 0. Browser QA `/forge` at desktop and mobile must show the 3 x 3 grid, readable text, no overlap, and visible protected grail state.

- [ ] **Step 5: Commit and merge**

```bash
git add docs/superpowers/plans/2026-07-09-retention-profit-roadmap.md apps/web/src/components/forge-workbench.tsx apps/web/src/components/forge-workbench-client.tsx apps/web/src/components/__tests__/forge-admin.test.tsx apps/web/src/components/__tests__/forge-workbench.test.tsx apps/web/src/app/globals.css
git commit -m "feat: add forge 2 creative workbench"
```

### Task 2: Phase 6 Protocol Economy Controls

**Files:**
- Create: `apps/web/src/lib/economy.ts`
- Create: `apps/web/src/lib/__tests__/economy.test.ts`
- Modify: `apps/web/src/lib/game-state.ts`
- Modify: `apps/web/src/components/status-rail.tsx`
- Modify: `apps/web/src/components/reveal-panel.tsx`
- Modify: `packages/contracts/contracts/Forge.sol`
- Modify: `packages/contracts/contracts/Marketplace.sol`
- Modify: `packages/contracts/test/Forge.test.ts`
- Modify: `packages/contracts/test/Marketplace.test.ts`

**Execution note:** The current contracts already enforce exact Forge fees, marketplace treasury fees, fee caps, seller proceeds, and pack treasury credit in Hardhat tests. Phase 6 should change Solidity only if those existing tests expose a missing protocol invariant; otherwise add app-level economy controls and rerun the existing contract suite as the enforcement gate.

- [ ] **Step 1: Write failing economy tests**

```ts
expect(calculateProtocolTake({ priceCents: 900, feeBps: 250 }).protocolFeeCents).toBe(23);
expect(validateSinkBudget({ craftFeeCents: 150, dustSpent: 5 }).allowed).toBe(true);
expect(projectDropMargin({ packPriceCents: 900, inventoryCostCents: 520, feeBps: 250 }).grossMarginCents).toBeGreaterThan(0);
```

Run: `pnpm --filter @gacha/web test -- economy`
Expected: FAIL because `economy.ts` does not exist.

- [ ] **Step 2: Implement explicit fee and sink math**

Add pure functions for pack margin, marketplace fee, forge fee, dust sink limits, buyback spread, and operator reserve target. Export UI-ready summaries with cents and basis points.

Run: `pnpm --filter @gacha/web test -- economy`
Expected: PASS.

- [ ] **Step 3: Add protocol enforcement tests**

```solidity
await expect(forge.connect(user).craft(recipeId, inputs, { value: fee - 1n })).to.be.revertedWithCustomError(forge, "InsufficientForgeFee");
await expect(marketplace.connect(user).buy(listingId, { value: ask })).to.changeEtherBalances([treasury], [fee]);
```

Run: `pnpm --filter @gacha/contracts test -- Forge Marketplace`
Expected: FAIL before contract fee enforcement is updated.

- [ ] **Step 4: Implement contract fee controls**

Add explicit treasury fee paths, configurable caps, and events that disclose fee basis points. Do not add randomness or opaque dynamic pricing.

Run: `pnpm --filter @gacha/contracts test -- Forge Marketplace`
Expected: PASS.

- [ ] **Step 5: Phase 6 verification gate and merge**

Run:
```bash
pnpm --filter @gacha/web test -- economy dashboard
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm -r build
git diff --check
```

Commit message: `feat: add protocol economy controls`.

### Task 3: Phase 7 Indexer and User Activity

**Files:**
- Create: `apps/web/src/lib/activity-index.ts`
- Create: `apps/web/src/lib/__tests__/activity-index.test.ts`
- Modify: `apps/web/src/components/activity-feed.tsx`
- Modify: `apps/web/src/components/status-rail.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write failing activity-index tests**

```ts
const events = buildActivityTimeline([
  { type: "PACK_OPENED", txHash: "0xabc", createdAt: "2026-07-09T00:00:00.000Z" },
  { type: "FORGE_CRAFTED", txHash: "0xdef", createdAt: "2026-07-09T00:01:00.000Z" }
]);
expect(events[0]?.label).toBe("Forge craft submitted");
expect(events.some((event) => event.txUrl.includes("0xdef"))).toBe(true);
```

Run: `pnpm --filter @gacha/web test -- activity-index`
Expected: FAIL because the index module does not exist.

- [ ] **Step 2: Implement local indexer model**

Normalize drop, reveal, market, redemption, forge, and wallet events into one timeline with human labels, chain links, status, and user-facing next action.

Run: `pnpm --filter @gacha/web test -- activity-index activity-feed`
Expected: PASS.

- [ ] **Step 3: Phase 7 verification gate and merge**

Run:
```bash
pnpm --filter @gacha/web test
pnpm -r typecheck
pnpm --filter @gacha/web build
git diff --check
```

Commit message: `feat: add user activity index`.

### Task 4: Phase 8 Collection Progression

**Files:**
- Create: `apps/web/src/lib/collection-progression.ts`
- Create: `apps/web/src/lib/__tests__/collection-progression.test.ts`
- Modify: `apps/web/src/components/vault-grid.tsx`
- Modify: `apps/web/src/components/status-rail.tsx`
- Modify: `apps/web/src/lib/game-state.ts`

- [ ] **Step 1: Write failing collection progression tests**

```ts
const progress = calculateSetProgress({
  ownedTags: ["pokemon_raw", "fire", "alternate_art"],
  targetTags: ["pokemon_raw", "fire", "water", "graded"]
});
expect(progress.percentComplete).toBe(50);
expect(progress.nextBestAction).toBe("Trade, forge, or buy a water card");
```

Run: `pnpm --filter @gacha/web test -- collection-progression`
Expected: FAIL because the progression module does not exist.

- [ ] **Step 2: Implement progression loops**

Add sets, album completion, title badges, creative Forge goals, daily objectives, and collection milestones that reward profile status or materials, not hidden odds boosts.

Run: `pnpm --filter @gacha/web test -- collection-progression vault`
Expected: PASS.

- [ ] **Step 3: Phase 8 verification gate and merge**

Run:
```bash
pnpm --filter @gacha/web test
pnpm -r typecheck
pnpm --filter @gacha/web build
git diff --check
```

Commit message: `feat: add collection progression loops`.

### Task 5: Phase 9 Marketplace Upgrade

**Files:**
- Create: `apps/web/src/lib/marketplace.ts`
- Create: `apps/web/src/lib/__tests__/marketplace.test.ts`
- Modify: `apps/web/src/components/market-board.tsx`
- Modify: `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`
- Modify: `packages/contracts/contracts/Marketplace.sol`
- Modify: `packages/contracts/test/Marketplace.test.ts`

- [ ] **Step 1: Write failing marketplace model tests**

```ts
expect(sortListings(sampleListings, "best-value")[0]?.id).toBe("listing-under-floor");
expect(calculateSellerProceeds({ askCents: 12500, feeBps: 250 }).sellerReceivesCents).toBe(12188);
expect(flagListingRisk({ askCents: 50000, floorCents: 12000 }).severity).toBe("high");
```

Run: `pnpm --filter @gacha/web test -- marketplace vault-market-redemption`
Expected: FAIL before the market model exists.

- [ ] **Step 2: Implement upgraded market behavior**

Add seller proceeds, fee disclosure, sort modes, floor comparison, buyback comparison, listing health, escrow status, and transparent protocol take.

Run: `pnpm --filter @gacha/web test -- marketplace vault-market-redemption`
Expected: PASS.

- [ ] **Step 3: Add and pass contract marketplace tests**

Run: `pnpm --filter @gacha/contracts test -- Marketplace`
Expected: PASS with fee event, escrow ownership, seller proceeds, and treasury transfer assertions.

- [ ] **Step 4: Phase 9 verification gate and merge**

Run:
```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm -r build
git diff --check
```

Commit message: `feat: upgrade marketplace liquidity`.

### Task 6: Phase 10 Premium Human Design Pass

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/drop-lobby.tsx`
- Modify: `apps/web/src/components/reveal-panel.tsx`
- Modify: `apps/web/src/components/forge-workbench-client.tsx`
- Modify: `apps/web/src/components/market-board.tsx`
- Modify: `apps/web/src/components/status-rail.tsx`

- [ ] **Step 1: Write route smoke assertions for complete premium surfaces**

```tsx
expect(screen.getByRole("navigation", { name: /Core routes/i })).toBeInTheDocument();
expect(screen.getByText(/Vault Signal Drop/i)).toBeInTheDocument();
expect(screen.getByText(/Recipe Book/i)).toBeInTheDocument();
expect(screen.getByText(/Seller receives/i)).toBeInTheDocument();
```

Run: `pnpm --filter @gacha/web test -- smoke dashboard forge-admin vault-market-redemption`
Expected: FAIL until the upgraded copy and marketplace labels are present.

- [ ] **Step 2: Apply design pass**

Tighten typography, spacing, card radius, button density, mobile stacking, accessible contrast, Robinhood green accents, restrained terminal styling, and concise human-written copy.

Run: `pnpm --filter @gacha/web test -- smoke dashboard forge-admin vault-market-redemption`
Expected: PASS.

- [ ] **Step 3: Browser QA**

Run the web app and inspect `/`, `/forge`, `/market`, `/vault`, `/redemption`, and `/admin/inventory` at desktop and mobile. Expected: no overlap, no clipped button text, no blank panels, and no visual style that reads as generated filler.

- [ ] **Step 4: Phase 10 verification gate and merge**

Run:
```bash
pnpm --filter @gacha/web test
pnpm -r typecheck
pnpm --filter @gacha/web build
git diff --check
```

Commit message: `style: polish premium app experience`.

### Task 7: Phase 11 Public Testnet Readiness

**Files:**
- Modify: `packages/contracts/scripts/deploy.ts`
- Modify: `packages/contracts/scripts/seed.ts`
- Modify: `packages/contracts/scripts/smoke.ts`
- Modify: `apps/web/src/lib/deployments.ts`
- Modify: `apps/web/src/lib/contracts/registry.ts`
- Modify: `docs/testnet-runbook.md`
- Modify: `docs/mainnet-migration-runbook.md`
- Create: `docs/public-testnet-checklist.md`

- [ ] **Step 1: Write failing deployment config tests**

```ts
expect(getContractAddress("robinhoodTestnet", "PackSale")).toMatch(/^0x[a-fA-F0-9]{40}$/);
expect(getExplorerTxUrl("robinhoodTestnet", "0xabc")).toContain("0xabc");
```

Run: `pnpm --filter @gacha/web test -- registry transaction-config live-state`
Expected: FAIL if any required testnet deployment metadata is missing or malformed.

- [ ] **Step 2: Harden deploy, seed, and smoke scripts**

Require explicit environment variables, print deploy addresses, seed deterministic sample inventory, verify role grants, and run smoke reads against Robinhood testnet without exposing secrets.

Run:
```bash
pnpm --filter @gacha/contracts typecheck
pnpm --filter @gacha/contracts build
```

Expected: PASS.

- [ ] **Step 3: Document testnet to mainnet path**

`docs/public-testnet-checklist.md` must include wallet setup, faucet requirement, deploy command, seed command, smoke command, app env variables, known limitations, compliance disclaimers, and mainnet switch checklist.

- [ ] **Step 4: Final verification gate and merge**

Run:
```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @gacha/contracts smoke:testnet
git diff --check
```

Expected: local test/build gates pass. `smoke:testnet` must pass only when funded testnet deployer credentials and deployed addresses are available; if the external network is unavailable, record the exact blocker in `docs/public-testnet-checklist.md`.

Commit message: `chore: prepare public testnet launch`.

## Self-Review

- Spec coverage: Forge creativity, economy controls, activity indexing, collection progression, marketplace liquidity, premium design, and public testnet readiness each have a dedicated task, tests, verification gate, and merge step.
- Placeholder scan: No task uses open-ended placeholders. External testnet smoke has an explicit allowed blocker path because it depends on funded credentials and network availability.
- Type consistency: App modules use `cents`, `bps`, `txHash`, and chain names already used by the current web and contract code. Contract tasks target existing `Forge.sol` and `Marketplace.sol` surfaces.
