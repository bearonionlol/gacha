# Gacha Super App

This repository contains the Gacha Super App protocol package and its Robinhood Chain testnet web app. It includes deterministic app-side activity and progression models, but it does not include a hosted indexer, production metadata service, fantasy stock arena, or a production mainnet deployment.

The protocol package lives in `packages/contracts` and includes:

- `InventoryRegistry`: anchors offchain inventory hashes, metadata URIs, redeemable flags, grail protection, and tokenization records.
- `ItemToken`: ERC-1155 tokens for one-of-one physical inventory items and fungible game items.
- `CommitRevealRandomnessProvider`: testnet commit/reveal randomness adapter for drops.
- `PackSale`: native-token pack purchase and reveal flow for anchored inventory with an atomically delivered, disclosed starter-material bundle.
- `Marketplace`: fixed-price ERC-1155 escrow marketplace.
- `BuybackVault`: quote-based native-token buyback vault.
- `Forge`: capped recipe-based crafting with immutable blueprint commitments, unique user imprints, retained catalysts, bounded reviewer allowances, and hard physical-inventory burn protection.
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

Deploy to a local Hardhat node:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/deploy.ts --network localhost
```

Seed a local deployment:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/seed.ts --network localhost
```

Smoke-check a local deployment:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/smoke.ts --network localhost
```

Deploy to Robinhood testnet:

```bash
pnpm --filter @gacha/contracts deploy:testnet
```

Seed Robinhood testnet:

```bash
pnpm --filter @gacha/contracts seed:testnet
```

Smoke-check Robinhood testnet:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

Run the one-shot collector journey on a fresh seeded testnet deployment:

```bash
pnpm --filter @gacha/contracts rehearse:testnet
```

The rehearsal purchases and reveals the sample pack, validates its physical card and starter materials, completes all three Forge recipes, settles a marketplace listing, cancels a custody-safe redemption rehearsal, accepts and withdraws a buyback quote, returns the collectible, and restores buyback liquidity. It records every transaction hash and refuses to run against mainnet or a previously used sample drop.

Deploy to Robinhood mainnet:

```bash
pnpm --filter @gacha/contracts deploy:mainnet
```

Mainnet deploy is blocked by default while the deploy script still uses `CommitRevealRandomnessProvider`. Mainnet migration must review and replace randomness with an approved fair/verifiable provider; `ALLOW_OPERATOR_RANDOMNESS_MAINNET=true` is only an unsafe override for controlled rehearsal.

Deployment scripts write registries to `deployments/<network>.json`.

## Web App

The web app lives in `apps/web`. It is a testnet command surface for drops, reveal actions, vault portfolio, fixed-price market settlement, a funded buyback desk, Forge v3, redemption, admin inventory intake, and public testnet readiness checks.

Run the web app locally:

```bash
pnpm --filter @gacha/web dev
```

Build and verify the web app:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
```

The app runs in deterministic demo mode when no deployment registry is present. After Robinhood testnet deployment, review `deployments/robinhoodTestnet.json`; the app deployment adapter expects Robinhood chain ID `46630` and the eight protocol contract addresses. The `/admin/inventory` route includes a public testnet readiness panel that checks the deployment registry, public RPC URL, chain mode, operator controls, and mainnet cutover gate.

## Runbooks

- Testnet operations: `docs/testnet-runbook.md`
- Mainnet migration controls: `docs/mainnet-migration-runbook.md`

Testnet seeding uses sample inventory and placeholder metadata URIs. It creates one guaranteed physical-card drop with three Fire shards and one Vault seal, configures a disclosed 2.5% marketplace fee, installs three capped Forge blueprints, and funds one 0.004 ETH sample buyback quote. Sample seeding and automated rehearsal are blocked on mainnet.

Protocol revenue accrues through pack revenue, explicit paid Forge recipes, and the disclosed marketplace fee. Buyback funding is protocol liquidity, not revenue; its economics depend on disciplined quotes and later resale or inventory reuse. Production mainnet still requires frozen and legally reviewed inventory metadata, approved fair/verifiable randomness, verified custody and fulfillment operations, audited contracts, multisig role ownership, deployment-registry review, monitored indexing and support services, and a private launch rehearsal.
