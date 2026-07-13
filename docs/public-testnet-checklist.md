# Public Testnet Checklist

Use this checklist for a fresh Robinhood Chain testnet release. A passing testnet rehearsal is evidence that the configured contracts work together; it is not a mainnet security audit or custody certification.

## Wallet And Secrets

- Use a dedicated testnet deployer with at least 0.032 ETH after deployment and seeding so the rehearsal can cover the 0.01 ETH sample pack, 0.005 ETH of Forge fees, temporary 0.012 ETH market settlement, and gas without relying on a mid-run top-up.
- Set `DEPLOYER_PRIVATE_KEY` and `ROBINHOOD_TESTNET_RPC_URL` in `packages/contracts/.env`; never commit either value.
- Treat any key pasted into chat, logs, tickets, or source control as compromised. Move remaining funds and replace it before a public test or any mainnet work.
- Confirm the configured signer address and balance without printing the private key.

## Local Gate

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm -r build
git diff --check
```

Required result: all commands exit successfully. The contract suite must include the full collector journey and Forge adversarial cases.

## Fresh Deployment

```bash
pnpm --filter @gacha/contracts deploy:testnet
pnpm --filter @gacha/contracts seed:testnet
pnpm --filter @gacha/contracts smoke:testnet
pnpm --filter @gacha/contracts rehearse:testnet
pnpm --filter @gacha/contracts smoke:testnet
```

Review `deployments/robinhoodTestnet.json` after deployment. The rehearsal is intentionally one-shot and requires an unused sample drop. Save its transaction hashes with the reviewed deployment registry.

The seed must produce:

- One 0.01 ETH physical-card test drop with three Fire shards and one Vault seal guaranteed at reveal.
- Five active, supply-capped Forge recipes: Duplicate Recycler, Fire Signal, Vault Resonance, Resonant Refinery, and Curator Sigil.
- A physical collectible and earned Resonance Aura used only as retained catalysts, never as burn inputs.
- Five active VaultForge V4 recipes with reviewed Magic/Echo/Prism/Star costs, fees, total caps, and per-wallet caps.
- A weighted Dust reward policy attached to every sale-enabled drop and wallet-bound Dust credit verified on reveal.
- Real custody inventory loaded into each enabled tier or set pool, with enough distinct cards for guided reservations.
- Strict same-identity duplicate proofs, current-tier Anchors, claim-specific custody, and exact timeout restoration covered by adversarial tests.
- A 250 bps marketplace protocol fee.
- One active 0.004 ETH sample buyback quote with an unreserved payout available.

## Web Configuration

Set these values in `apps/web/.env.local` from the reviewed deployment:

```bash
NEXT_PUBLIC_GACHA_CHAIN_MODE=testnet
NEXT_PUBLIC_GACHA_RPC_URL=https://reviewed-robinhood-testnet-rpc.example
NEXT_PUBLIC_GACHA_ENABLE_ADMIN=true
NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY={...reviewed deployment JSON...}
ADMIN_CHAIN_INDEXER_START_BLOCK=<first deployment event block>
ADMIN_CHAIN_INDEXER_CONFIRMATIONS=12
ADMIN_CHAIN_INDEXER_LOG_CHUNK_SIZE=1000
ADMIN_CHAIN_INDEXER_MAX_BLOCKS=100000
```

Start the app with `pnpm --filter @gacha/web dev --port 64920`. The `/admin/inventory` readiness panel and the contract smoke script must both pass.

## Browser Gate

Inspect `/`, `/vault`, `/market`, `/forge`, `/redemption`, and `/admin/inventory` at desktop and mobile widths. Confirm that:

- Guaranteed contents, exact transaction prices, Forge fees, marketplace fees, output caps, and buyback quotes are visible before a wallet confirmation.
- Pack purchase hands its purchase ID to reveal.
- Wallet reconnect restores pending and revealed purchases from finalized indexed events.
- Admin **Sync chain** advances only after PackSale, Marketplace, and RedemptionRegistry custody events reconcile successfully.
- Vault Ascension displays all six exact 3 by 3 seals, reads live Dust and Passport state, requires retained duplicate proofs, and exposes craft, reveal, guided selection, default settlement, cancellation, and Dust Exchange actions without clipped controls.
- Marketplace list, buy, cancel, proceeds withdrawal, buyback acceptance, and payout withdrawal controls render without clipped or overlapping text.
- Redemption clearly represents physical fulfillment and keeps operator status changes separate from user requests.

## Known Testnet Limits

- `CommitRevealRandomnessProvider` is operator-controlled. It is acceptable only for controlled testnet rehearsal and must be replaced for mainnet.
- Sample IPFS URIs and external image URLs are placeholders, not production metadata or custody evidence.
- Activity is currently an app-side model rather than a durable hosted indexer.
- Admin roles are held by the testnet deployer. Mainnet requires reviewed multisig ownership and least-privilege operators.
- Public launch still needs hosted monitoring, error reporting, transaction indexing, support workflows, inventory reconciliation, terms, privacy disclosures, and jurisdiction-specific legal review.

## Mainnet Stop Gate

Do not use the sample seed or rehearsal on mainnet. Do not launch mainnet until `docs/mainnet-migration-runbook.md` is complete, the randomness adapter is replaced, contract and economic audits are closed, custody and redemption operations are live, secrets are rotated, and all privileged roles are transferred to reviewed multisigs.
