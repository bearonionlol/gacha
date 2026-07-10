# Gacha Super App

This repository contains the Gacha Super App protocol package and its Robinhood Chain testnet web app. It includes deterministic app-side activity and progression models, but it does not include a hosted indexer, production metadata service, fantasy stock arena, or a production mainnet deployment.

The protocol package lives in `packages/contracts` and includes:

- `InventoryRegistry`: anchors offchain inventory hashes, metadata URIs, redeemable flags, grail protection, and tokenization records.
- `ItemToken`: ERC-1155 tokens for one-of-one physical inventory items and fungible game items.
- `CommitRevealRandomnessProvider`: testnet commit/reveal randomness adapter for drops.
- `PackSale`: native-token pack purchase and reveal flow for anchored inventory, disclosed starter materials, and replay-safe wallet-bound Dust rewards.
- `Marketplace`: fixed-price ERC-1155 escrow marketplace.
- `BuybackVault`: quote-based native-token buyback vault.
- `Forge`: capped recipe-based crafting with immutable blueprint commitments, unique user imprints, retained catalysts, bounded reviewer allowances, and hard physical-inventory burn protection.
- `DustLedger` and `DustRewardPolicy`: non-transferable Magic, Echo, Prism, and Star Dust balances with immutable per-drop reward policies.
- `CollectibleForgePolicy`: immutable collectible identity, set, tier, trade-in, and pool-eligibility metadata for physical token IDs.
- `TierPool` and `TradeInVault`: reservation-safe real-card output pools and claim-specific custody for surrendered duplicates.
- `VaultPassport` and `VaultForge`: wallet rank progression, five mixed-Dust Ascension recipes, guided choices, exact timeout restoration, and deterministic Dust Exchange.
- `RedemptionRegistry`: redemption request and fulfillment lifecycle.

Physical token IDs are deterministic from inventory IDs. Preserve inventory IDs across environments so testnet and mainnet token IDs remain stable for the same physical items.

The default `CommitRevealRandomnessProvider` is for local, testnet, and controlled demo deployments. It is operator-controlled and is not production-safe randomness for mainnet drops without explicit review and replacement by an approved fair/verifiable provider.

## Requirements

- Node.js and pnpm compatible with the workspace lockfile.
- Remote deployments require a funded deployer key.
- Robinhood Chain RPC URLs may use the shared defaults in `packages/shared`, but explicit RPC environment variables are required for controlled testnet and mainnet operations.

Required deployment environment variables:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ROBINHOOD_TESTNET_RPC_URL=https://...
export ROBINHOOD_MAINNET_RPC_URL=https://...
```

## Local Commands

Install dependencies:

```bash
pnpm install
```

Compile contracts:

```bash
pnpm --filter @gacha/contracts build
```

Run contract tests:

```bash
pnpm --filter @gacha/contracts test
```

Typecheck only the contracts package:

```bash
pnpm --filter @gacha/contracts typecheck
```

Typecheck every workspace package:

```bash
pnpm -r typecheck
```

Run the complete contract journey against an ephemeral local Hardhat node:

```bash
pnpm --filter @gacha/contracts local
```

The command requires `127.0.0.1:8545` to be free. It acquires an exclusive repository lock, starts a Hardhat node, verifies a readiness signal from that child process, deploys and validates all fifteen contracts, seeds the sample state, runs smoke, runs the one-shot collector rehearsal, and runs smoke again. Success, stage failure, `SIGINT`, and `SIGTERM` all stop the node, release the lock, and remove the generated `deployments/localhost.json`; if that file existed before the command, its original contents and mode are restored instead. No deployer key or remote RPC URL is required.

Deploy to Robinhood testnet:

```bash
pnpm --filter @gacha/contracts deploy:testnet
```

Seed Robinhood testnet:

```bash
pnpm --filter @gacha/contracts seed:testnet
```

Onboard reviewed, anchored real inventory into general or set-specific Ascension pools:

```bash
export TIER_POOL_MANIFEST_PATH=docs/tier-pool-manifest.example.json
pnpm --filter @gacha/contracts onboard-pool:testnet
```

Smoke-check Robinhood testnet:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

Run the one-shot collector journey on a fresh seeded testnet deployment:

```bash
pnpm --filter @gacha/contracts rehearse:testnet
```

The rehearsal purchases and reveals the sample pack, validates its physical card, starter bundles, and exact Dust policy, completes all five legacy Forge recipes, settles a marketplace listing, cancels a custody-safe redemption rehearsal, accepts and withdraws a buyback quote, returns the collectible, and restores buyback liquidity. It records every transaction hash and refuses to run against mainnet or a previously used sample drop.

Deploy to Robinhood mainnet:

```bash
pnpm --filter @gacha/contracts deploy:mainnet
```

Mainnet deploy is blocked by default while the deploy script still uses `CommitRevealRandomnessProvider`. Mainnet migration must review and replace randomness with an approved fair/verifiable provider; `ALLOW_OPERATOR_RANDOMNESS_MAINNET=true` is only an unsafe override for controlled rehearsal.

Deployment scripts write registries to `deployments/<network>.json`.

## Web App

The web app lives in `apps/web`. It is a testnet command surface for drops, reveal actions, vault portfolio, fixed-price market settlement, a funded buyback desk, Vault Ascension V4, redemption, admin inventory intake, and public testnet readiness checks.

Run the web app locally:

```bash
pnpm --filter @gacha/web dev
```

Build and verify the web app:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
pnpm --filter @gacha/web test:e2e
```

Browser tests run the complete Gacha-to-redemption journey plus route, image, overflow, and deployment-diagnostic checks in desktop Chromium and Pixel 7 emulation. CI runs the same suite against the production Next.js build.

The app runs in deterministic demo mode when no deployment registry is present. After Robinhood testnet deployment, review `deployments/robinhoodTestnet.json`; the app deployment adapter expects Robinhood chain ID `46630`, the base protocol addresses, and the VaultForge V4 addresses used by `/forge`. The `/admin/inventory` route includes a public testnet readiness panel that checks the deployment registry, public RPC URL, chain mode, operator controls, and mainnet cutover gate.

## Runbooks

- Testnet operations: `docs/testnet-runbook.md`
- Mainnet migration controls: `docs/mainnet-migration-runbook.md`

Testnet seeding uses sample inventory and placeholder metadata URIs. It creates one guaranteed physical-card drop with starter materials, configures a disclosed 2.5% marketplace fee, installs the legacy rehearsal recipes plus five capped VaultForge V4 recipes, creates a tier-weighted Dust reward policy, and funds one 0.004 ETH sample buyback quote. Real Ascension output cards are never fabricated by seed; they enter through reviewed TierPool custody onboarding. Sample seeding and automated rehearsal are blocked on mainnet.

Protocol revenue accrues through pack revenue, explicit paid Forge recipes, and the disclosed marketplace fee. Buyback funding is protocol liquidity, not revenue; its economics depend on disciplined quotes and later resale or inventory reuse. Production mainnet still requires frozen and legally reviewed inventory metadata, approved fair/verifiable randomness, verified custody and fulfillment operations, audited contracts, multisig role ownership, deployment-registry review, monitored indexing and support services, and a private launch rehearsal.
