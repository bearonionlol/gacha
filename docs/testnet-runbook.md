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

The seed script reads `packages/inventory/src/sample-inventory.ts`, anchors sample inventory hashes, creates one sample drop from drop-ready sample inventory, and guarantees three Fire shards plus one Vault seal with its physical-card reveal. It creates and activates the Duplicate Recycler, Fire Signal, and Vault Resonance Forge blueprints; configures a 250 bps marketplace fee; publishes a 0.004 ETH sample buyback quote; and funds one unreserved payout.

The three Forge recipes form a complete starter loop:

- Duplicate Recycler burns two Fire shards for one Forge dust at no protocol fee.
- Fire Signal burns one Fire shard, one Vault seal, and one Forge dust for a Signal badge at a 0.001 ETH fee.
- Vault Resonance burns one Signal badge for a capped Resonance aura at a 0.002 ETH fee while requiring the sample physical card as a retained catalyst.

Physical inventory can never be configured as a Forge burn input. Recipe output caps, blueprint hashes, and user imprint hashes are enforced onchain. The sample seed exits immediately on Robinhood mainnet.

Testnet seed data uses sample inventory and placeholder metadata URIs such as `ipfs://metadata/<inventoryId>.json`. Do not treat testnet seed metadata as production-reviewed inventory metadata or custody evidence.

Real-brand inventory descriptors in sample data are resale inventory descriptors only. Do not imply brand affiliation, endorsement, sponsorship, or investment exposure.

## Testnet Smoke

Run a read-only smoke check:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

The smoke script reads `deployments/robinhoodTestnet.json`, verifies deployed bytecode, checks contract wiring and roles, and validates the seeded starter bundle, active Forge recipes, retained physical catalyst, marketplace fee, active buyback quote, and unreserved buyback liquidity.

## Automated Collector Rehearsal

Run this only once against a fresh seeded deployment:

```bash
pnpm --filter @gacha/contracts rehearse:testnet
```

The script records transaction hashes while it purchases and reveals the pack, crafts the full three-stage Forge path, performs a marketplace settlement, requests and cancels redemption, accepts and withdraws the buyback quote, returns the physical collectible, and restores the buyback reserve. It then verifies 0.01 ETH of pack credit, 0.003 ETH of Forge credit, and the 250 bps market fee path.

Run the read-only smoke again after rehearsal:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

The rehearsal refuses mainnet and refuses a deployment whose sample drop has already been purchased. Redeploy for a clean repeat.

## Phase 4C Web Operations Smoke

Phase 4C is the browser-wallet rehearsal for testnet operations. Run it only after deploy, seed, and smoke have completed against Robinhood testnet:

```bash
pnpm --filter @gacha/contracts deploy:testnet
pnpm --filter @gacha/contracts seed:testnet
pnpm --filter @gacha/contracts smoke:testnet
pnpm --filter @gacha/contracts rehearse:testnet
pnpm --filter @gacha/contracts smoke:testnet
```

Start the web app with the testnet registry and RPC URL:

```bash
export NEXT_PUBLIC_GACHA_CHAIN_MODE=testnet
export NEXT_PUBLIC_GACHA_RPC_URL="$ROBINHOOD_TESTNET_RPC_URL"
export NEXT_PUBLIC_GACHA_ENABLE_ADMIN=true
export NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY="$(cat deployments/robinhoodTestnet.json)"
pnpm --filter @gacha/web dev --port 64920
```

## Public Testnet Go/No-Go

Before inviting testers, open `/admin/inventory` and review the Public testnet readiness panel. Treat the session as blocked if any readiness row is failing.

The panel expects:

- `NEXT_PUBLIC_GACHA_CHAIN_MODE=testnet`
- `NEXT_PUBLIC_GACHA_RPC_URL` set to a reviewed Robinhood testnet RPC endpoint
- `NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY` set to the reviewed contents of `deployments/robinhoodTestnet.json`
- `NEXT_PUBLIC_GACHA_ENABLE_ADMIN=true` for operator rehearsal sessions
- Mainnet migration still gated by `docs/mainnet-migration-runbook.md`

The readiness panel is an app-facing checklist. It does not replace `pnpm --filter @gacha/contracts smoke:testnet`, transaction hash recording, custody records, or fulfillment operator records.

Browser smoke path:

- Connect a funded Robinhood testnet wallet on `/`.
- Reserve a seeded pack with `PackSale.purchase`.
- Reveal the purchase ID with `PackSale.reveal` after the reveal transaction is eligible.
- Open `/market`, scan known seeded inventory, select an owned token, approve Marketplace, and list the item.
- In the live market ticket, read an onchain listing ID, buy at its exact price, cancel as the seller, or withdraw credited proceeds.
- In the buyback desk, select an owned quoted token, review the exact onchain quote, approve BuybackVault, accept, and withdraw the credited payout.
- Open `/forge`, connect the wallet, load each recipe, place the exact 3 x 3 pattern, review the output cap and fee, create an imprint, approve Forge, and craft.
- Open `/redemption`, scan known seeded inventory, select a redeemable token, approve RedemptionRegistry, and request redemption.
- Open `/admin/inventory` with an operator wallet that holds `REDEMPTION_ADMIN_ROLE`.
- Submit redemption lifecycle updates as separate transactions: approve, mark packed, mark shipped, complete, or cancel.

Record every transaction hash, the wallet address used, and the deployment registry commit or artifact reviewed for the session. Do not use the browser app as the source of truth for fulfillment; the contract state and operator records remain authoritative.

The public release checklist is `docs/public-testnet-checklist.md`.

## Mainnet Cutover Checks

Before changing any Phase 4C workflow from testnet to mainnet, complete the full controls in `docs/mainnet-migration-runbook.md`. At minimum, confirm:

- The web app points at a reviewed Robinhood mainnet deployment registry, not `deployments/robinhoodTestnet.json`.
- RPC values, chain IDs, explorer links, and wallet switch prompts all target Robinhood mainnet.
- Admin roles are assigned to reviewed operator wallets or a multisig; no deployer hot wallet should be the long-lived production operator.
- Real inventory, custody evidence, metadata, redemption terms, and brand/IP language have passed legal and product review.
- Production randomness, indexing, monitoring, and support workflows are approved before public pack sales.
- Any testnet-only seed data, placeholder metadata, and unsafe rehearsal contracts are removed or explicitly replaced.

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
