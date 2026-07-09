# Mainnet Migration Runbook

This runbook defines controls for moving the protocol package from testnet to Robinhood mainnet. It is a gated operational checklist, not approval to launch.

Mainnet deployment requires legal review, inventory freeze, deployment registry review, admin role review, explicit RPC override, and a private smoke run before any public launch.

## Scope

The protocol is mainnet-ready by configuration through environment variables, Hardhat network selection, and deployment registry review. Migration does not require contract rewrites when the approved artifacts and configuration are unchanged.

Mainnet migration must preserve inventory IDs. Physical token IDs are deterministically derived from inventory IDs, so changing IDs between environments changes the corresponding physical token IDs.

## Required Environment

Set environment variables explicitly for the deployment session:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ROBINHOOD_TESTNET_RPC_URL=https://...
export ROBINHOOD_MAINNET_RPC_URL=https://...
```

`ROBINHOOD_MAINNET_RPC_URL` must be an explicit, reviewed RPC override for the deployment window. Do not rely on an implicit default for mainnet launch operations.

## Pre-Migration Gates

Complete these gates before running `deploy:mainnet`:

- Legal review: legal approval is required before mainnet deployment and before any public drop involving real-brand inventory descriptors.
- Inventory freeze: freeze the production inventory IDs, inventory hashes, metadata URIs, redeemable flags, grail protection flags, and custody records.
- Custody verification: verify that each production physical item has reviewed custody evidence before it can be anchored or used in a public drop.
- Metadata review: confirm that production metadata is final, pinned or otherwise durably available, and free of affiliation, endorsement, sponsorship, or investment language.
- Artifact review: verify the compiled contracts correspond to the reviewed source and test results.
- Deployment registry review: confirm the expected `deployments/robinhoodMainnet.json` path, chain ID, deployer address, and address review procedure.
- Admin role review: approve the deployer and post-deploy role holders for default admin and operational roles.
- Treasury review: approve treasury addresses used by `PackSale`, `Marketplace`, and `Forge`.
- Launch plan review: define a private smoke window and a separate public launch decision.

## Verification Before Deployment

Run from the repository root:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts typecheck
pnpm -r typecheck
git diff --check
```

Do not deploy to mainnet with failing verification.

## Mainnet Deployment

Deploy to Robinhood mainnet only after every pre-migration gate is complete:

```bash
pnpm --filter @gacha/contracts deploy:mainnet
```

The deployment script writes `deployments/robinhoodMainnet.json` with the network name, chain ID, deployer, timestamp, and contract addresses.

Immediately review the generated registry:

```bash
cat deployments/robinhoodMainnet.json
```

Confirm:

- `network` is `robinhoodMainnet`.
- `chainId` matches Robinhood mainnet.
- `deployer` is the approved deployment account.
- Every contract address is present and unique where expected.
- The registry is archived in the approved deployment record.

## Private Mainnet Smoke

Before public launch, run a private smoke check against mainnet:

```bash
pnpm --filter @gacha/contracts exec hardhat run scripts/smoke.ts --network robinhoodMainnet
```

The smoke check verifies deployed bytecode, contract wiring, default admin ownership by the recorded deployer, and required operational roles. A successful private smoke run is required before any public announcement, public drop, marketplace activity, buyback operation, Forge activity, or redemption intake.

## Production Seeding Policy

Do not run the testnet seed command against mainnet. The `seed:testnet` script is for sample inventory and placeholder metadata only.

Mainnet inventory anchoring must use frozen, reviewed production inventory metadata and custody verification. Real-brand names may appear only as resale inventory descriptors and must not imply affiliation, endorsement, sponsorship, or investment exposure.

## Post-Deploy Controls

After private smoke passes:

- Review and record admin role holders for every deployed contract.
- Rotate roles away from the deployer where the approved operations model requires it.
- Confirm treasury addresses and fee settings before enabling public flows.
- Confirm public drop inventory IDs match the frozen production inventory list.
- Confirm physical token IDs derived from production inventory IDs match the reviewed launch record.
- Keep `deployments/robinhoodMainnet.json` under deployment registry review for any later operational scripts.

Public launch remains blocked until legal, operations, custody, and deployment owners approve the private smoke results and final inventory list.
