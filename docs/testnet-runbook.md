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
- `DustLedger`
- `DustRewardPolicy`
- `CollectibleForgePolicy`
- `TradeInVault`
- `TierPool`
- `VaultPassport`
- `VaultForge`

## Testnet Seed

Seed the deployed contracts:

```bash
pnpm --filter @gacha/contracts seed:testnet
```

The seed script reads `packages/inventory/src/sample-inventory.ts`, anchors sample inventory hashes, creates one sample drop from drop-ready sample inventory, and guarantees three Fire shards plus one Vault seal with its physical-card reveal. It creates the legacy rehearsal recipes, the five VaultForge V4 recipe policies, a weighted per-pack Dust policy, immutable collectible Forge metadata, a 250 bps marketplace fee, and a funded 0.004 ETH sample buyback quote.

The five Forge recipes form a two-bundle mastery loop:

- Duplicate Recycler burns two Fire shards for one Forge dust at no protocol fee.
- Fire Signal burns one Fire shard, one Vault seal, and one Forge dust for a Signal badge at a 0.001 ETH fee.
- Vault Resonance burns one Signal badge for a capped Resonance aura at a 0.002 ETH fee while requiring the sample physical card as a retained catalyst.
- Resonant Refinery burns a later Signal badge for Resonance dust while retaining the Aura as a catalyst.
- Curator Sigil burns Resonance dust at a 0.001 ETH fee while retaining both the Aura and the linked physical card.

Physical inventory can never be configured as a Forge burn input. Recipe output caps, blueprint hashes, and user imprint hashes are enforced onchain. The sample seed exits immediately on Robinhood mainnet.

VaultForge V4 adds Recast, Guided Recast, Ascension, Guided Ascension, and Set-Focused Ascension. Every craft spends Magic Dust plus recipe-specific Echo, Prism, or Star Dust. Each surrendered card requires a retained same-identity proof token. Ascension requires an Anchor at the wallet's current Passport rank. Trade-ins move into claim-specific custody only after output inventory is reserved; an expired randomness request restores the exact cards, Dust, and fee. Passport rank advances only after output settlement.

## TierPool Custody Onboarding

VaultForge cannot settle without real, inventory-backed output cards. Review and anchor each custody record, seed its immutable collectible Forge policy, then list the inventory IDs and pool modes in a JSON manifest matching `docs/tier-pool-manifest.example.json`.

```bash
export TIER_POOL_MANIFEST_PATH=docs/tier-pool-manifest.example.json
pnpm --filter @gacha/contracts onboard-pool:testnet
pnpm --filter @gacha/contracts smoke:testnet
```

`setFocused: false` loads the tier-wide pool. `setFocused: true` loads the exact set pool. The operator script is idempotent for cards already in the expected pool and fails closed for unanchored, non-redeemable, policy-ineligible, differently pooled, or externally tokenized records. Maintain enough distinct eligible cards for the largest guided reservation before enabling a recipe.

Testnet seed data uses sample inventory and placeholder metadata URIs such as `ipfs://metadata/<inventoryId>.json`. Do not treat testnet seed metadata as production-reviewed inventory metadata or custody evidence.

Real-brand inventory descriptors in sample data are resale inventory descriptors only. Do not imply brand affiliation, endorsement, sponsorship, or investment exposure.

## Reviewed Single-Item Drop Onboarding

Use the reviewed-drop path for a controlled physical-item rehearsal after Admin intake has reached `drop_ready`.
Do not use the sample seed command for real custody records. Start from
`docs/reviewed-drop-manifest.example.json` and preserve decimal quantities as strings so JSON cannot round wei or token
amounts.

The manifest is intentionally narrow: one anchored inventory item, one allowlisted buyer, one exact-price pull, one
active Dust policy, and up to four reviewed game-item bonuses. The operator script rejects mainnet, non-46630 chains,
inactive sale windows, missing roles, zero or malformed hashes, tokenized inventory, mismatched existing anchors,
unexpected existing policies, trade-in eligibility, TierPool eligibility, and non-idempotent drop IDs.

```bash
export TESTNET_DROP_MANIFEST_PATH=docs/reviewed-drop-manifest.example.json
pnpm --filter @gacha/contracts onboard-drop:testnet
```

Review the final JSON output and set the local web build to the returned drop ID and exact price. A single-wallet
allowlist uses an explicitly empty Merkle proof:

```bash
NEXT_PUBLIC_GACHA_DROP_ID=2
NEXT_PUBLIC_GACHA_PACK_PRICE_WEI=1000000000000000
NEXT_PUBLIC_GACHA_ALLOWLIST_PROOF=[]
```

The onboarding command never purchases the drop. After the allowlisted wallet reserves the pull, the testnet
randomness operator resolves that purchase with a recoverable, ignored local journal:

```bash
export TESTNET_PURCHASE_ID=2
export TESTNET_PURCHASE_BUYER=0x...
pnpm --filter @gacha/contracts fulfill-pack-randomness:testnet
```

The browser wallet can then call `PackSale.reveal`. The randomness command refuses mainnet and verifies the matching
`PackPurchased` event before committing or revealing a seed. Never place a deployer key, randomness seed, Admin session
secret, database credential, or authenticated RPC URL in a public web variable.

## Testnet Smoke

Run a read-only smoke check:

```bash
pnpm --filter @gacha/contracts smoke:testnet
```

The smoke script reads `deployments/robinhoodTestnet.json`, verifies all fifteen deployed contracts, checks wiring and least-privilege runtime roles, and validates starter bundles, legacy recipes, all five VaultForge V4 Dust/fee/cap policies, Dust Exchange, collectible metadata, marketplace fee, active buyback quote, and unreserved buyback liquidity.

## Automated Collector Rehearsal

Run this only once against a fresh seeded deployment:

```bash
pnpm --filter @gacha/contracts rehearse:testnet
```

The script records transaction hashes while it purchases and reveals the pack, verifies 100 Magic Dust plus two 10-Dust specialty rolls, crafts the full five-stage legacy Forge path, performs a marketplace settlement, requests and cancels redemption, accepts and withdraws the buyback quote, returns the physical collectible, and restores the buyback reserve. It then verifies 0.01 ETH of pack credit, 0.005 ETH of Forge credit, and the 250 bps market fee path.

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
export ADMIN_CHAIN_INDEXER_START_BLOCK=<first deployment event block>
export ADMIN_CHAIN_INDEXER_CONFIRMATIONS=12
export ADMIN_CHAIN_INDEXER_LOG_CHUNK_SIZE=1000
export ADMIN_CHAIN_INDEXER_MAX_BLOCKS=100000
pnpm --filter @gacha/web dev --port 64920
```

After admin wallet sign-in, use **Sync chain** in `/admin/inventory`. The finalized event indexer records PackSale purchases and reveals, Marketplace listing custody, and RedemptionRegistry custody before advancing its checkpoint. Run the same endpoint from a trusted scheduler in hosted environments; do not expose an admin session or CSRF token to a public client.

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
- Open `/forge`, connect the wallet, preview each 3 by 3 seal, then use Live settlement with the exact Anchor, trade-in, retained duplicate-proof, fee, and claim IDs. Verify reveal, guided selection, default settlement, Dust Exchange, and timeout cancellation states.
- Open `/redemption`, scan known seeded inventory, select a redeemable token, approve RedemptionRegistry, and request redemption.
- Open `/admin/inventory` with an operator wallet that holds `REDEMPTION_ADMIN_ROLE`.
- Use **Sync chain** after the finality window, then confirm inventory custody and audit evidence match the completed Marketplace or RedemptionRegistry transaction.
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
