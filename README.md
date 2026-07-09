# Gacha Protocol Package

This repository currently contains the protocol package for the Gacha Super App phase 2 work. It does not include the web app, indexer, metadata service, fantasy stock arena, or a production mainnet deployment.

The protocol package lives in `packages/contracts` and includes:

- `InventoryRegistry`: anchors offchain inventory hashes, metadata URIs, redeemable flags, grail protection, and tokenization records.
- `ItemToken`: ERC-1155 tokens for one-of-one physical inventory items and fungible game items.
- `CommitRevealRandomnessProvider`: testnet commit/reveal randomness adapter for drops.
- `PackSale`: native-token pack purchase and reveal flow for anchored inventory.
- `Marketplace`: fixed-price ERC-1155 escrow marketplace.
- `BuybackVault`: quote-based native-token buyback vault.
- `Forge`: recipe-based burn/mint crafting with review and protection controls.
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

Deploy to Robinhood mainnet:

```bash
pnpm --filter @gacha/contracts deploy:mainnet
```

Mainnet deploy is blocked by default while the deploy script still uses `CommitRevealRandomnessProvider`. Mainnet migration must review and replace randomness with an approved fair/verifiable provider; `ALLOW_OPERATOR_RANDOMNESS_MAINNET=true` is only an unsafe override for controlled rehearsal.

Deployment scripts write registries to `deployments/<network>.json`.

## Runbooks

- Testnet operations: `docs/testnet-runbook.md`
- Mainnet migration controls: `docs/mainnet-migration-runbook.md`

Testnet seeding uses sample inventory and placeholder metadata URIs. It also mints the sample Forge input game items to the deployer and approves Forge so the sample recipe can be crafted immediately on local and testnet deployments. Production mainnet requires frozen, legally reviewed inventory metadata, approved fair/verifiable randomness, custody verification, deployment registry review, admin role review, explicit mainnet RPC override, and a private smoke run before any public launch.
