# Testnet Runbook

This runbook covers protocol-package operations, Phase 3 web app verification, Robinhood testnet deployment, and local Hardhat development. It does not deploy an indexer, metadata service, or public production drop.

## Environment

Use a funded deployer account for remote networks:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ROBINHOOD_TESTNET_RPC_URL=https://...
export ROBINHOOD_MAINNET_RPC_URL=https://...
```

`ROBINHOOD_TESTNET_RPC_URL` is used by the `robinhoodTestnet` network. `ROBINHOOD_MAINNET_RPC_URL` is listed here because the same package is mainnet-ready by configuration, but do not use mainnet commands during testnet operations.

## Local Verification

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

Typecheck the contracts package:

```bash
pnpm --filter @gacha/contracts typecheck
```

Typecheck all workspace packages:

```bash
pnpm -r typecheck
```

## Localhost Deployment

Start a local Hardhat node in one terminal:

```bash
pnpm --filter @gacha/contracts exec hardhat node
```

Deploy to localhost:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/deploy.ts --network localhost
```

Seed localhost:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/seed.ts --network localhost
```

Smoke-check localhost:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/smoke.ts --network localhost
```

The local deployment registry is written to `deployments/localhost.json`.

## Robinhood Testnet Deployment

Deploy contracts:

```bash
pnpm --filter @gacha/contracts deploy:testnet
```

Review the generated deployment registry:

```bash
cat deployments/robinhoodTestnet.json
```

Confirm that the file includes the expected network name, chain ID, deployer, timestamp, and addresses for:

- `InventoryRegistry`
- `ItemToken`
- `CommitRevealRandomnessProvider`
- `PackSale`
- `Marketplace`
- `BuybackVault`
- `Forge`
- `RedemptionRegistry`

## Testnet Seed

Seed the deployed contracts:

```bash
pnpm --filter @gacha/contracts seed:testnet
```

The seed script reads `packages/inventory/src/sample-inventory.ts`, anchors sample inventory hashes, creates one sample drop from drop-ready sample inventory, creates one sample Forge recipe, mints missing sample Forge input game items to the deployer, and approves Forge for the deployer when needed.

Testnet seed data uses sample inventory and placeholder metadata URIs such as `ipfs://metadata/<inventoryId>.json`. Do not treat testnet seed metadata as production-reviewed inventory metadata or custody evidence.

Real-brand inventory descriptors in sample data are resale inventory descriptors only. Do not imply brand affiliation, endorsement, sponsorship, or investment exposure.

## Testnet Smoke

Run a read-only smoke check:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

The smoke script reads `deployments/robinhoodTestnet.json`, verifies deployed bytecode, checks contract wiring, confirms default admin ownership by the recorded deployer, and checks required operational roles.

## Final Verification

Before handing off a protocol change, run:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts typecheck
pnpm -r typecheck
git diff --check
```

If a command fails, resolve the failure within the relevant task scope or report the blocker with the exact command and error.

## Phase 3 Web App Verification

Run the local app:

```bash
pnpm --filter @gacha/web dev
```

Run web checks:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
```

Browser QA routes:

- `/`
- `/vault`
- `/market`
- `/forge`
- `/redemption`
- `/admin/inventory`

Confirm each route renders in demo/testnet mode, shows required odds or lifecycle disclosures, avoids official-affiliation claims, and has no overlapping text at desktop or mobile widths.

After Robinhood testnet deployment writes `deployments/robinhoodTestnet.json`, confirm the registry includes chain ID `46630` and all eight protocol contract addresses before using the web app as a testnet readiness surface.
