# Phase 3 App Design

## Summary

Phase 3 builds the first usable web app layer on top of the merged Phase 2 protocol package. The goal is a premium, Robinhood-inspired testnet app experience that makes the protocol understandable and playable before Robinhood testnet deployment.

This phase is localhost-first. It must work from the repo without a deployed testnet registry, and it must be easy to switch to `deployments/robinhoodTestnet.json` after protocol deployment tomorrow.

## Approved Direction

Use the recommended app-MVP path:

- Build `apps/web` as a Next.js App Router package.
- Use existing `packages/inventory`, `packages/shared`, and `packages/contracts` artifacts instead of inventing a separate data model.
- Ship the first screen as the app experience, not a marketing landing page.
- Cover the core loop: drops, reveal decisioning, vault, marketplace, Forge, redemption, buyback, and admin inventory.
- Keep Fantasy Stock Arena out of this overnight phase; add it after the core collectible loop is working.

Alternative approaches considered:

- Admin-only Phase 3: lower risk, but it would not give a complete user-facing loop for testnet QA.
- Full super-app Phase 3 including fantasy arena and indexer: too broad for one overnight implementation cycle and likely to dilute quality.

## Product Scope

Phase 3 includes:

- Premium app shell with navigation, network status, wallet status placeholders, and legal/testnet disclaimers.
- Dashboard/drop lobby showing active sample drop, odds, pack price, supply, inventory backing, and randomness disclosure.
- Pack reveal simulation that mirrors the protocol decision flow and routes to keep, list, buyback, redeem, craft, or hold.
- Optional arcade panel named Signal Run that gives users a skill-flavored way to earn non-monetary streak, XP, and recipe progress during the reveal loop.
- Vault portfolio using real sample inventory from `packages/inventory`.
- Marketplace browse/listing cards with fee and escrow disclosures.
- Forge page with recipe book, ingredient tray, grid-style crafting surface, output preview, caps, fees, and grail warnings.
- Redemption dashboard showing request lifecycle states.
- Admin inventory console for intake review, lifecycle visibility, photo hash, and JSON/CSV export hooks.
- Contract/deployment client layer that can read local/testnet deployment registry files when present and falls back to demo mode when absent.

Phase 3 excludes:

- Real wallet transaction submission.
- Indexer service.
- Fantasy Stock Arena.
- Real testnet deployment.
- Mainnet deployment.
- Production fulfillment backend.

## UX Principles

The app should feel like a premium collectible trading terminal, not a generic NFT dApp.

Visual system:

- Black, off-white, cool graphite, muted gray surfaces, precise green accents.
- Dense but readable layouts: app sidebar, top status rail, compact stat cards, table-like cards, and high-signal item details.
- Hacker cues through small monospace labels, chain mode badges, hashes, block/deployment status, and event-feed styling.
- Welcoming copy and clear next actions so new users do not feel lost.

Avoid:

- Casino imagery.
- Confetti-heavy loops.
- Hidden auto-roll prompts.
- Guaranteed-profit or expected-value claims.
- Official affiliation language for Robinhood, Pokemon, One Piece, Bandai, Toei, Shueisha, Nintendo, Game Freak, or Creatures.
- One-note neon cyberpunk styling.

## App Structure

Routes:

- `/`: command-center dashboard with drop lobby, pack action, vault summary, market signals, Forge CTA, and activity feed.
- `/vault`: portfolio grid and item detail side panel.
- `/market`: fixed-price marketplace mock/registry-aware view.
- `/forge`: crafting grid and recipe book.
- `/redemption`: redemption lifecycle dashboard.
- `/admin/inventory`: owner/admin inventory intake and export console.

Core components:

- `AppShell`: shared layout, navigation, mode badges, wallet panel, disclaimer footer.
- `StatusRail`: deployment registry status, chain mode, testnet/mainnet warnings.
- `DropLobby`: odds, price, supply, inventory-backed disclosure.
- `ArcadePanel`: fast tap/route challenge preview with streak, XP, recipe progress, and clear no-odds-boost disclosure.
- `RevealPanel`: reveal state and next-action buttons.
- `VaultGrid`: collection cards from sample inventory and game items.
- `MarketBoard`: listing cards and fee/proceeds disclosure.
- `ForgeWorkbench`: inventory tray, grid slots, recipe book, output preview, safety warnings.
- `RedemptionTimeline`: requested to completed/cancelled state view.
- `AdminInventoryConsole`: item form, lifecycle controls, export actions.

## Data Flow

Inputs:

- `packages/inventory/src/sample-inventory.ts` supplies physical collectible inventory.
- `packages/shared/src/chains.ts` supplies Robinhood Chain config.
- `deployments/<network>.json` supplies deployed protocol addresses when present.

Client data modules:

- `src/lib/inventory.ts`: maps sample inventory into display cards, vault stats, drop candidates, grail markers, and export payloads.
- `src/lib/deployments.ts`: safely reads known deployment registry snapshots at build/dev time when files exist, and exposes `demo` status when absent.
- `src/lib/game-state.ts`: deterministic local view-models for drops, listings, recipes, redemptions, activity, and reveal outcomes.
- `src/lib/arcade.ts`: deterministic Signal Run levels, streak scoring, XP labels, and recipe progress copy.
- `src/lib/format.ts`: currency, cents, token IDs, addresses, and status labels.

This phase can run without a deployed blockchain. After testnet deployment, the deployment client will surface real addresses and mode status, and later phases can replace local view-model actions with wagmi/viem writes.

## Safety And Compliance

Every primary screen must show one or more relevant safety cues:

- Testnet/demo mode status.
- Odds shown before purchase.
- Arcade XP and streaks do not change pull odds or guarantee item value.
- Operator-controlled testnet randomness disclosure.
- Resale inventory descriptor disclaimer for real brands.
- No affiliation/endorsement disclaimer.
- Redemption modeled unless separate off-chain terms apply.
- Fantasy/securities claims absent from this phase.

## Testing

Use focused tests where they catch product regressions:

- Dashboard tests: odds and randomness disclosure are visible.
- Navigation tests: app shell exposes core routes.
- Vault tests: real inventory fields and brand disclaimers render.
- Forge tests: recipe book, ingredient safety, and output preview render.
- Arcade tests: Signal Run renders streak/progress and no-odds-boost disclosure.
- Admin tests: lifecycle/export controls and required fields render.
- Deployment client tests: missing registry produces demo status; valid registry is parsed.

Verification commands:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
pnpm -r typecheck
```

Visual verification:

- Run the web dev server locally.
- Use browser screenshots for desktop and mobile.
- Confirm no text overlap, blank routes, or template-looking placeholder screens.

## Morning Testnet Path

After Phase 3 is merged or ready:

1. Set `DEPLOYER_PRIVATE_KEY` and `ROBINHOOD_TESTNET_RPC_URL`.
2. Run protocol `deploy:testnet`, `seed:testnet`, and `smoke:testnet`.
3. Confirm `deployments/robinhoodTestnet.json`.
4. Point the web app to the testnet registry and run web QA against Robinhood testnet.
