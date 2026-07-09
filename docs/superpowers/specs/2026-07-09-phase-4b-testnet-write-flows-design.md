# Phase 4B Testnet Write Flows Design

## Summary

Phase 4B turns the Phase 4A guarded surfaces into explicit Robinhood Chain testnet transaction flows. Users can connect an injected EVM wallet, switch to Robinhood Chain Testnet, and submit live testnet writes for pack reservation, marketplace listing, Forge crafting, and redemption requests.

This phase keeps the contract system unchanged. The web app adds a browser-only transaction layer that calls deployed contracts through the user's wallet. It does not use custodial signing, server private keys, or background transaction prompts.

## Approved Direction

Use a direct EIP-1193 plus viem wallet-client approach:

- Keep the Phase 4A direct injected wallet model instead of adding a full wallet framework.
- Add minimal write ABI fragments beside the existing read ABI fragments.
- Centralize transaction preparation, confirmation status, receipt waiting, explorer links, and sanitized errors in `apps/web/src/lib/contracts/transactions.ts`.
- Replace `ActionGuardPanel` copy with real client-side write panels for each flow.
- Keep every write behind an explicit user click and a clear confirmation block.

Alternative approaches considered:

- Add wagmi/RainbowKit now. This would provide richer wallet state, but it is heavier than needed for the first live write slice and would force a broader UI migration.
- Add a backend relayer. This conflicts with the current no-custody, no-server-signing requirement and increases operational risk.
- Implement only pack purchase first. This is safer but leaves the testnet app feeling incomplete; Phase 4B can support all four core writes with small, focused panels because the contracts already exist.

## Product Scope

Phase 4B includes:

- Reserve a pack by calling `PackSale.purchase(dropId)` with the configured native testnet ETH value.
- Approve the marketplace by calling `ItemToken.setApprovalForAll(Marketplace, true)`.
- List a selected sample item by calling `Marketplace.list(tokenId, amount, price)`.
- Approve Forge by calling `ItemToken.setApprovalForAll(Forge, true)`.
- Craft a selected recipe by calling `Forge.craft(recipeId)` with the configured recipe fee.
- Approve redemption by calling `ItemToken.setApprovalForAll(RedemptionRegistry, true)`.
- Request redemption by calling `RedemptionRegistry.requestRedemption(tokenId)`.
- Show idle, ready, confirming, submitted, confirmed, rejected, and failed states.
- Show transaction hash, block number when available, and Robinhood testnet explorer link.
- Keep browsing and read-only views usable when wallet, registry, or RPC state is unavailable.

Phase 4B excludes:

- Mainnet writes.
- Admin inventory anchoring, drop creation, quote management, recipe creation, or fulfillment updates from the public app.
- Server-side signing, relayers, session keys, or gas sponsorship.
- Real securities, fractional shares, or stock prizes.
- Off-chain shipping automation.
- Indexer-backed activity history.

## UX Principles

- Use precise finance-grade language: "testnet transaction", "approval", "ETH value", "receipt", "confirmed", and "rejected".
- Never auto-open a wallet prompt on page load.
- Never imply expected profit, odds improvement, or guaranteed resale value.
- Display the contract target and action before the wallet prompt opens.
- Keep transaction panels compact and professional; no casino language or pressure copy.
- Make wallet errors actionable without exposing stack traces, private env values, RPC URLs, or raw provider payloads.
- Keep Phase 4B visibly testnet-only so mainnet migration is intentional later.

## Architecture

Extend the existing `apps/web/src/lib/contracts` boundary:

- `abis.ts`: add write functions for `purchase`, `setApprovalForAll`, `list`, `craft`, and `requestRedemption`.
- `transactions.ts`: browser-safe helpers for creating a viem wallet client from the injected provider, encoding/sending writes, waiting for receipts through the existing public client, formatting hashes, and sanitizing errors.
- `transaction-config.ts`: small testnet action descriptors for drop ID, sample token ID, amounts, prices, recipe ID, and redemption token ID used by the public UI.

Add focused UI components:

- `TransactionActionPanel`: reusable client component that checks wallet/provider/chain readiness and manages one transaction lifecycle.
- `PackPurchasePanel`: wraps `PackSale.purchase`.
- `MarketplaceListPanel`: wraps marketplace approval and listing.
- `ForgeCraftPanel`: wraps Forge approval and craft.
- `RedemptionRequestPanel`: wraps redemption approval and request.

The current route structure remains unchanged. Dashboard uses pack purchase first. Market, Forge, and redemption routes get the relevant write panels in place of the Phase 4A guard copy.

## Data Flow

1. Component loads a testnet action descriptor and the deployment registry.
2. If the registry is missing, incomplete, or not Robinhood Chain Testnet, the panel shows read-only status.
3. If no injected wallet exists, the panel shows wallet-required status.
4. If the user is disconnected, the panel offers a connect button and makes no provider request until clicked.
5. If the user is on the wrong chain, the panel offers the existing switch flow.
6. Once connected on Robinhood Chain Testnet, the panel shows the exact action summary.
7. On submit click, the panel creates a wallet client, sends the transaction, and stores the hash.
8. The panel waits for a public-client receipt using the existing Robinhood testnet RPC.
9. Confirmed receipts show the hash, block number, and explorer link.
10. Rejected or failed requests show sanitized copy and allow retry.

## Error Handling

- Missing registry: "Live contracts are not configured for this environment."
- Unsupported chain registry: "This write flow is locked to Robinhood Chain Testnet."
- Missing wallet: "Open an EVM wallet such as Phantom or MetaMask to send testnet transactions."
- Disconnected wallet: show a connect action only.
- Wrong wallet chain: show a switch action only.
- User rejection: "Transaction rejected in wallet."
- Insufficient funds: "Wallet does not have enough testnet ETH for this action."
- Contract revert or RPC failure: "Transaction failed or could not be confirmed. Review wallet details and retry."

The UI must not display private keys, raw env values, stack traces, or full RPC provider objects.

## Testing

Use TDD for the transaction layer and component behavior:

- Transaction helpers encode each write with the expected target, ABI, args, and value.
- Transaction helpers sanitize provider, viem, and unknown errors.
- Transaction panel does not request accounts or send transactions on render.
- Transaction panel sends only after an explicit button click.
- Submitted and confirmed states render hash, receipt block, and explorer link.
- Rejected and failed states render retryable sanitized messages.
- Market, Forge, and redemption panels render both approval and final action controls.

Verification commands:

```bash
pnpm --filter @gacha/web test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Browser verification:

- Run the local dev server with the testnet registry in `.env.local`.
- Visit `/`, `/market`, `/forge`, and `/redemption`.
- Confirm no wallet prompt appears on page load.
- Confirm panels show testnet-only status without a wallet.
- With an injected wallet, confirm wrong-chain and ready states render correctly.
- If funded testnet ETH is available, send one pack reserve transaction and confirm hash/receipt UI.

## Mainnet Migration

Mainnet migration should require configuration and explicit product approval, not UI rewrites:

- Contract addresses continue to come from the deployment registry.
- Chain ID, currency, RPC, and explorer data continue to come from `@gacha/shared`.
- Phase 4B panels should reject non-testnet registries for now.
- Mainnet enablement later should add a separate chain-mode gate, production risk copy, and final contract registry, rather than reusing testnet defaults silently.
