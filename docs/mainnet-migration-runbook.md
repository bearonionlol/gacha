# Mainnet Migration Runbook

This runbook defines controls for moving the protocol package from testnet to Robinhood mainnet. It is a gated operational checklist, not approval to launch.

Mainnet deployment requires legal review, inventory freeze, randomness-provider review, deployment registry review, admin role review, an authenticated RPC, a pinned mainnet-fork rehearsal, and a private smoke run before any public launch.

## Scope

The protocol is mainnet-ready by configuration through environment variables, Hardhat network selection, and deployment registry review. Migration does not require contract rewrites when the approved artifacts and configuration are unchanged.

Mainnet migration must preserve inventory IDs. Physical token IDs are deterministically derived from inventory IDs, so changing IDs between environments changes the corresponding physical token IDs.

The default `CommitRevealRandomnessProvider` is a testnet/demo adapter. It is operator-controlled and must not be treated as production-safe randomness for mainnet pack drops.

## Required Environment

Set environment variables explicitly for the deployment session. Never reuse a key that has appeared in chat, source control, logs, or tickets:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ROBINHOOD_TESTNET_RPC_URL=https://...
export ROBINHOOD_MAINNET_RPC_URL=https://...
export MAINNET_RELEASE_DEPLOYER_ADDRESS=0x...
export MAINNET_RELEASE_ADMIN_ADDRESS=0x...
export MAINNET_RELEASE_OPERATIONS_ADDRESS=0x...
export MAINNET_RELEASE_GUARDIAN_ADDRESS=0x...
export MAINNET_RELEASE_TREASURY_ADDRESS=0x...
export MAINNET_DEPLOYMENT_CONFIRMATION=DEPLOY_ROBINHOOD_MAINNET_PAUSED_CANARY
export ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS=0x...
export ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH=0x...
export ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI=...
```

`ROBINHOOD_MAINNET_RPC_URL` must be an explicit, reviewed RPC override for the deployment window. Do not rely on an implicit default for mainnet launch operations.

## Pre-Migration Gates

Complete these gates before running `deploy:mainnet`:

- Legal review: legal approval is required before mainnet deployment and before any public drop involving real-brand inventory descriptors.
- Inventory freeze: freeze the production inventory IDs, inventory hashes, metadata URIs, redeemable flags, grail protection flags, and custody records.
- Custody verification: verify that each production physical item has reviewed custody evidence before it can be anchored or used in a public drop.
- Metadata review: confirm that production metadata is final, pinned or otherwise durably available, and free of affiliation, endorsement, sponsorship, or investment language.
- Artifact review: verify the compiled contracts correspond to the reviewed source and test results.
- Randomness-provider review: replace the default `CommitRevealRandomnessProvider` with approved fair/verifiable randomness before production launch, or explicitly document that any mainnet deployment is only a controlled unsafe rehearsal.
- Deployment registry review: confirm the expected `deployments/robinhoodMainnet.json` path, chain ID, deployer address, and address review procedure.
- Admin role review: approve the deployer and post-deploy role holders for default admin and operational roles.
- Role separation: use distinct addresses for the deployer, protocol-admin multisig, operations multisig, guardian multisig, and treasury. The deployment script rejects reused addresses.
- Treasury review: approve treasury addresses used by `PackSale`, `Marketplace`, `Forge`, and `VaultForge`.
- Forge economy review: approve every recipe input, retained catalyst, fee, wallet cap, global output cap, schedule, metadata hash, and reviewer allowance policy. Reconcile reserved output capacity before activating overlapping recipes.
- Vault Ascension review: approve each Dust reward distribution, mixed-Dust cost, fee, claim cap, Passport transition, duplicate-proof rule, and timeout. Reconcile tier-wide and set-specific real-card pool depth against all guided reservations.
- Liquidity review: approve marketplace fee basis points, buyback quote methodology, maximum inventory exposure, and independently reserved native liquidity. Buyback liquidity is a balance-sheet commitment, not protocol revenue.
- Launch plan review: define a private smoke window and a separate public launch decision.
- Fork rehearsal: complete `docs/mainnet-fork-rehearsal.md` at a pinned mainnet block and archive a production-candidate manifest proving the exact coordinator, treasury, role handoff, deployer revocation, and paused launch state.

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

## Mainnet-Fork Rehearsal

When Robinhood testnet ETH is unavailable, use the pinned mainnet-fork path as the network-state rehearsal. It consumes no testnet ETH and cannot broadcast to mainnet. Follow `docs/mainnet-fork-rehearsal.md` and review the schema in `docs/mainnet-release-manifest.md`.

The fork path is required before a direct mainnet canary, but it does not waive the security audit, legal, custody, inventory, fulfillment, monitoring, multisig, or production-randomness gates. Canary activation is a separate reviewed multisig operation after deployment and smoke approval.

## Mainnet Deployment

Deploy to Robinhood mainnet only after every pre-migration gate is complete:

```bash
pnpm --filter @gacha/contracts deploy:mainnet
```

The mainnet deploy path requires a pinned `CoordinatorRandomnessProvider` configuration. It verifies the configured coordinator bytecode against `ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH` before deploying. The fork-only commit/reveal override is never accepted as mainnet randomness configuration.

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

The mainnet smoke check verifies deployed bytecode, contract wiring, default admin ownership by the recorded deployer, and required operational roles without expecting testnet sample data. A successful private smoke run is required before any public announcement, public drop, marketplace activity, buyback operation, Forge activity, or redemption intake.

## Production Seeding Policy

Do not run the testnet seed command against mainnet. The seed script fails closed on `robinhoodMainnet`; it is for sample inventory, placeholder metadata, testnet fees, and testnet liquidity only. The automated collector rehearsal is also permanently blocked on mainnet.

For local and testnet craft rehearsal, the seed script also mints the sample Forge input game items to the deployer if missing and approves Forge for those inputs. This sample convenience must not be used as a production inventory or role policy.

Mainnet inventory anchoring must use frozen, reviewed production inventory metadata and custody verification. Real-brand names may appear only as resale inventory descriptors and must not imply affiliation, endorsement, sponsorship, or investment exposure.

Production TierPool loading requires a separately reviewed manifest and explicit mainnet override. Run it only after the immutable collectible policies, custody records, and destination pool modes have been signed off:

```bash
export TIER_POOL_MANIFEST_PATH=/absolute/path/to/reviewed-mainnet-pools.json
export ALLOW_POOL_ONBOARDING_MAINNET=true
pnpm --filter @gacha/contracts exec hardhat run scripts/onboard-pool.ts --network robinhoodMainnet
```

## Post-Deploy Controls

After private smoke passes:

- Review and record admin role holders for every deployed contract.
- Rotate roles away from the deployer where the approved operations model requires it.
- Confirm treasury addresses and fee settings before enabling public flows.
- Confirm physical inventory cannot appear in any Forge burn-input list and that physical catalysts remain in the collector wallet after a private craft simulation.
- Confirm every active Forge recipe's immutable output cap and aggregate reserved emissions match the approved economy ledger.
- Confirm VaultForge requires retained same-identity proofs, blocks grail trade-ins, restores exact assets on timeout, and cannot reserve more output choices than TierPool custody can satisfy.
- Confirm `CREDIT_ROLE`, `SPENDER_ROLE`, and `RESTORER_ROLE` are assigned only to reviewed protocol contracts, and move policy, pool, custody, pause, and recipe administration to approved multisigs.
- Confirm public drop inventory IDs match the frozen production inventory list.
- Confirm physical token IDs derived from production inventory IDs match the reviewed launch record.
- Keep `deployments/robinhoodMainnet.json` under deployment registry review for any later operational scripts.

Public launch remains blocked until legal, operations, custody, and deployment owners approve the private smoke results and final inventory list.
