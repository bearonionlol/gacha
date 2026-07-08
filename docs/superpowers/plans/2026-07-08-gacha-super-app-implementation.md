# Gacha Super App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Robinhood Chain testnet gacha super app using real Pokémon and One Piece inventory, with a mainnet-ready architecture.

**Architecture:** Implement the app as a pnpm TypeScript monorepo split into inventory, shared config, contracts, indexer, metadata, and web packages. Build in phases so each phase ships testable software: inventory foundation first, then protocol contracts, then admin/user app, then The Forge, then fantasy stock arena, then mainnet readiness.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js App Router, Tailwind CSS, wagmi, viem, RainbowKit, Hardhat, Solidity 0.8.28, OpenZeppelin Contracts, Vitest, Playwright, tsx, ESLint, Prettier.

---

## Scope Split

The super-app spec is intentionally broad, so implementation must be split into phase plans. Each phase must produce working, testable software and a commit boundary.

Phase order:

1. Inventory Foundation
2. Testnet Protocol
3. Admin Console
4. User App And Marketplace
5. The Forge
6. Fantasy Stock Arena
7. Production And Mainnet Readiness

Do not start a later phase until the previous phase passes its acceptance commands.

## Global File Structure

Create and evolve this structure:

- `package.json`: root scripts for workspace commands.
- `pnpm-workspace.yaml`: workspace package list.
- `tsconfig.base.json`: shared TypeScript compiler settings.
- `.env.example`: testnet, mainnet, admin, storage, and frontend variables.
- `README.md`: setup and operational guide.
- `docs/testnet-runbook.md`: testnet deployment and smoke-test guide.
- `docs/mainnet-migration-runbook.md`: migration checklist.
- `apps/web`: Next.js frontend, admin console, user app, Forge, marketplace, stock arena.
- `packages/shared`: chain config, formatting, schemas, constants.
- `packages/inventory`: real inventory schema, lifecycle reducer, photo hashing, import/export.
- `packages/contracts`: Solidity contracts, tests, deployment scripts, verification scripts.
- `packages/metadata`: metadata builder for inventory-backed items and game items.
- `packages/indexer`: event cache and API for pulls, listings, crafts, redemptions, buybacks.

## Global Quality Bar

Every phase must preserve these requirements:

- Production-testnet first, mainnet-ready by config.
- No hardcoded Robinhood testnet-only assumptions outside network config files.
- No official Pokémon, One Piece, Robinhood, Bandai, Toei, Shueisha, Nintendo, Game Freak, or Creatures affiliation claims.
- No real securities or fractional shares as gacha prizes.
- No sponsored stock seasons in V1.
- No paid cash-prize fantasy contests in V1.
- UI must look human-made, welcoming, and finance-grade, not vibe-coded.
- Use black, white, cool graphite, soft neutral surfaces, and precise Robinhood-inspired green accents.
- Show odds, testnet/mainnet mode, redemption status, transaction costs, and disclaimers.

## Shared Domain Types

Use these names consistently across phase plans.

```ts
export type SupportedBrand = "pokemon" | "one_piece" | "other";

export type InventoryCategory =
  | "raw_card"
  | "graded_card"
  | "sealed_product"
  | "promo"
  | "slab"
  | "box"
  | "accessory";

export type InventoryStatus =
  | "draft"
  | "photographed"
  | "verified"
  | "vaulted"
  | "drop_ready"
  | "tokenized"
  | "user_owned"
  | "listed"
  | "buyback_held"
  | "redemption_pending"
  | "redeemed";

export type GrailTier = "none" | "minor" | "major" | "grail";

export type InventoryItem = {
  inventoryId: string;
  brand: SupportedBrand;
  category: InventoryCategory;
  cardName: string;
  setName: string;
  cardNumber: string;
  language: string;
  edition: string;
  variant: string;
  rawConditionEstimate: string;
  conditionNotes: string;
  gradingCompany: string;
  grade: string;
  certNumber: string;
  certUrl: string;
  photoUrls: string[];
  photoHash: string;
  vaultLocationLabel: string;
  custodyStatus: InventoryStatus;
  redeemable: boolean;
  marketEstimateCents: number;
  buybackQuoteCents: number;
  grailTier: GrailTier;
  craftingTags: string[];
  dropEligibility: boolean;
  legalDisclaimer: string;
  createdAt: string;
  updatedAt: string;
};
```

## Phase 1: Inventory Foundation

**Goal:** Create the real-inventory source of truth before contracts or UI depend on it.

**Files:**

- Create: `packages/inventory/package.json`
- Create: `packages/inventory/tsconfig.json`
- Create: `packages/inventory/src/schema.ts`
- Create: `packages/inventory/src/lifecycle.ts`
- Create: `packages/inventory/src/photo-hash.ts`
- Create: `packages/inventory/src/export.ts`
- Create: `packages/inventory/src/sample-inventory.ts`
- Create: `packages/inventory/src/index.ts`
- Create: `packages/inventory/src/__tests__/schema.test.ts`
- Create: `packages/inventory/src/__tests__/lifecycle.test.ts`
- Create: `packages/shared/src/chains.ts`
- Create: `packages/shared/src/index.ts`

Tasks:

- [ ] Write failing tests for inventory schema validation.
- [ ] Implement `InventoryItem` schema with Zod.
- [ ] Write failing tests for lifecycle transitions.
- [ ] Implement allowed status transitions.
- [ ] Write failing tests for photo hash generation.
- [ ] Implement deterministic SHA-256 photo hash helper.
- [ ] Write failing tests for JSON/CSV export.
- [ ] Implement export helpers.
- [ ] Add Robinhood Chain testnet and mainnet config to `packages/shared`.
- [ ] Run `pnpm --filter @gacha/inventory test`.
- [ ] Run `pnpm --filter @gacha/shared test`.
- [ ] Commit with `feat: add inventory foundation`.

Acceptance:

```bash
pnpm --filter @gacha/inventory test
pnpm --filter @gacha/inventory typecheck
pnpm --filter @gacha/shared test
pnpm --filter @gacha/shared typecheck
```

Expected: all commands pass.

## Phase 2: Testnet Protocol

**Goal:** Deploy and test the Robinhood Chain-compatible protocol with inventory anchoring.

**Files:**

- Create: `packages/contracts/contracts/ItemToken.sol`
- Create: `packages/contracts/contracts/InventoryRegistry.sol`
- Create: `packages/contracts/contracts/PackSale.sol`
- Create: `packages/contracts/contracts/Marketplace.sol`
- Create: `packages/contracts/contracts/BuybackVault.sol`
- Create: `packages/contracts/contracts/Forge.sol`
- Create: `packages/contracts/contracts/RedemptionRegistry.sol`
- Create: `packages/contracts/contracts/randomness/IRandomnessProvider.sol`
- Create: `packages/contracts/contracts/randomness/CommitRevealRandomnessProvider.sol`
- Create: `packages/contracts/test/*.test.ts`
- Create: `packages/contracts/scripts/deploy.ts`
- Create: `packages/contracts/scripts/seed.ts`
- Create: `packages/contracts/scripts/smoke.ts`
- Create: `deployments/.gitkeep`

Tasks:

- [ ] Write failing `InventoryRegistry` tests for inventory ID and hash anchoring.
- [ ] Implement `InventoryRegistry`.
- [ ] Write failing `ItemToken` tests for minting physical inventory-backed tokens and game item tokens.
- [ ] Implement `ItemToken`.
- [ ] Write failing pack purchase/reveal tests.
- [ ] Implement `PackSale` with randomness adapter.
- [ ] Write failing marketplace list/cancel/buy tests.
- [ ] Implement fixed-price escrow marketplace.
- [ ] Write failing buyback quote tests.
- [ ] Implement `BuybackVault`.
- [ ] Write failing Forge recipe validation tests including caps, grail exclusions, and pause behavior.
- [ ] Implement `Forge`.
- [ ] Write failing redemption lifecycle tests.
- [ ] Implement `RedemptionRegistry`.
- [ ] Write deployment and smoke tests.
- [ ] Run contract tests.
- [ ] Commit with `feat: add testnet protocol`.

Acceptance:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass locally.

## Phase 3: Admin Console

**Goal:** Let the owner/admin manually enter and manage real inventory without needing a spreadsheet first.

**Files:**

- Create: `apps/web/src/app/admin/inventory/page.tsx`
- Create: `apps/web/src/components/admin/inventory-form.tsx`
- Create: `apps/web/src/components/admin/inventory-table.tsx`
- Create: `apps/web/src/components/admin/lifecycle-controls.tsx`
- Create: `apps/web/src/components/admin/photo-hash-panel.tsx`
- Create: `apps/web/src/lib/admin/inventory-store.ts`
- Create: `apps/web/src/lib/admin/export-inventory.ts`
- Create: `apps/web/src/components/admin/__tests__/*.test.tsx`

Tasks:

- [ ] Write failing tests for required admin intake fields.
- [ ] Implement inventory form with brand, category, raw/graded fields, photos, estimates, grail tier, tags, and redeemability.
- [ ] Write failing tests for lifecycle controls.
- [ ] Implement lifecycle transitions using `packages/inventory`.
- [ ] Write failing tests for JSON/CSV export.
- [ ] Implement admin export actions.
- [ ] Implement welcoming, human-crafted admin UI using the approved visual system.
- [ ] Add owner/admin feature flag.
- [ ] Commit with `feat: add inventory admin console`.

Acceptance:

```bash
pnpm --filter @gacha/web test -- admin
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
```

Expected: all commands pass.

## Phase 4: User App And Marketplace

**Goal:** Ship the premium user-facing app for drops, reveal, vault, item details, redemption, buyback, and P2P marketplace.

**Files:**

- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/market/page.tsx`
- Create: `apps/web/src/app/vault/page.tsx`
- Create: `apps/web/src/app/item/[inventoryId]/page.tsx`
- Create: `apps/web/src/components/drop/*`
- Create: `apps/web/src/components/market/*`
- Create: `apps/web/src/components/vault/*`
- Create: `apps/web/src/components/redemption/*`
- Create: `apps/web/src/components/buyback/*`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/app/globals.css`

Tasks:

- [ ] Write failing tests for odds visibility and testnet disclosure.
- [ ] Implement drop lobby.
- [ ] Write failing tests for reveal action routing.
- [ ] Implement pack reveal with keep, list, buyback, redeem, craft, and hold actions.
- [ ] Write failing tests for item detail disclaimers and real inventory fields.
- [ ] Implement item detail page.
- [ ] Write failing tests for marketplace listing cards and fee display.
- [ ] Implement marketplace browse/list/buy/cancel UI.
- [ ] Write failing tests for redemption and buyback eligibility states.
- [ ] Implement redemption and buyback flows.
- [ ] Run mobile and desktop visual checks.
- [ ] Commit with `feat: add user app marketplace flows`.

Acceptance:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
```

Expected: all commands pass, and visual QA confirms no generic/vibe-coded layout.

## Phase 5: The Forge

**Goal:** Make crafting the platform's central differentiator.

**Files:**

- Create: `apps/web/src/app/forge/page.tsx`
- Create: `apps/web/src/components/forge/crafting-grid.tsx`
- Create: `apps/web/src/components/forge/inventory-tray.tsx`
- Create: `apps/web/src/components/forge/recipe-book.tsx`
- Create: `apps/web/src/components/forge/output-preview.tsx`
- Create: `apps/web/src/components/forge/missing-ingredients.tsx`
- Create: `apps/web/src/components/forge/value-warning-dialog.tsx`
- Create: `apps/web/src/lib/forge/recipe-matcher.ts`
- Create: `apps/web/src/lib/forge/safety.ts`
- Create: `apps/web/src/components/forge/__tests__/*.test.tsx`

Tasks:

- [ ] Write failing tests for recipe matching.
- [ ] Implement recipe matching from grid contents.
- [ ] Write failing tests for grail and high-value warnings.
- [ ] Implement Forge safety warnings.
- [ ] Write failing tests for recipe book filters.
- [ ] Implement recipe book.
- [ ] Write failing tests for drag/drop grid behavior.
- [ ] Implement grid, inventory tray, output preview, and clear/autofill.
- [ ] Write failing tests for missing ingredient market links.
- [ ] Implement missing ingredient marketplace helper.
- [ ] Connect craft transaction to `Forge` contract.
- [ ] Commit with `feat: add forge crafting interface`.

Acceptance:

```bash
pnpm --filter @gacha/web test -- forge
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/contracts test -- test/Forge.test.ts
```

Expected: all commands pass.

## Phase 6: Fantasy Stock Arena

**Goal:** Add simulated market competition without real securities or wagering.

**Files:**

- Create: `packages/shared/src/stock-arena.ts`
- Create: `apps/web/src/app/arena/page.tsx`
- Create: `apps/web/src/components/arena/portfolio-builder.tsx`
- Create: `apps/web/src/components/arena/leaderboard.tsx`
- Create: `apps/web/src/components/arena/season-card.tsx`
- Create: `apps/web/src/lib/arena/scoring.ts`
- Create: `apps/web/src/lib/arena/paper-portfolio.ts`
- Create: `apps/web/src/components/arena/__tests__/*.test.tsx`

Tasks:

- [ ] Write failing tests for paper bankroll allocation.
- [ ] Implement paper portfolio allocation.
- [ ] Write failing tests for fantasy scoring.
- [ ] Implement scoring based on market movement inputs.
- [ ] Write failing tests for no-real-securities disclaimers.
- [ ] Implement arena UI with free weekly seasons, friend/global/faction leaderboards, and visible disclaimers.
- [ ] Add market shards and strategy item display.
- [ ] Commit with `feat: add fantasy stock arena`.

Acceptance:

```bash
pnpm --filter @gacha/web test -- arena
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/shared test
```

Expected: all commands pass.

## Phase 7: Production And Mainnet Readiness

**Goal:** Make testnet production-ready and ready for a clean mainnet migration when legal and operations are approved.

**Files:**

- Create: `docs/testnet-runbook.md`
- Create: `docs/mainnet-migration-runbook.md`
- Create: `apps/web/e2e/home.spec.ts`
- Create: `apps/web/e2e/admin-inventory.spec.ts`
- Create: `apps/web/e2e/forge.spec.ts`
- Create: `apps/web/e2e/marketplace.spec.ts`
- Create: `packages/indexer/src/server.ts`
- Create: `packages/indexer/src/cache.ts`
- Create: `packages/indexer/src/__tests__/cache.test.ts`

Tasks:

- [ ] Write failing indexer cache tests.
- [ ] Implement event cache.
- [ ] Write Playwright smoke tests for homepage, admin inventory, marketplace, and Forge.
- [ ] Implement testnet runbook.
- [ ] Implement mainnet migration runbook.
- [ ] Add deployment registry validation.
- [ ] Add final safety/disclaimer checklist.
- [ ] Run full verification.
- [ ] Commit with `test: add production readiness checks`.

Acceptance:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gacha/web e2e
pnpm --filter @gacha/contracts test
```

Expected: all commands pass.

## Final Acceptance

The super app is production-testnet ready when:

- Admin can enter real Pokémon and One Piece inventory.
- Inventory records can move through the approved lifecycle.
- Inventory hashes can be anchored.
- Testnet pack drops can reveal inventory-backed tokens.
- Users can list and buy items in the P2P marketplace.
- Users can request redemption.
- Users can accept buyback quotes when eligible.
- Users can craft through The Forge with recipe safety controls.
- Users can join a fantasy stock arena season with a paper bankroll.
- UI looks welcoming, premium, Robinhood-inspired, and human-made.
- Testnet/mainnet network config is separated and deployment registries are per-network.
- Mainnet migration is documented and does not require a product rewrite.

## Execution Recommendation

Start with Phase 1 only. Once Phase 1 passes and is committed, write the detailed Phase 2 protocol plan using the actual inventory package API from Phase 1.
