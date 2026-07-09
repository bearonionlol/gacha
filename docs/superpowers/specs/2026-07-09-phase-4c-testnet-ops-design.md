# Phase 4C Testnet Operations Design

## Summary

Phase 4C turns the Phase 4B write-enabled app into a testnet operations surface that a real operator can use for a controlled Robinhood Chain testnet rehearsal. The goal is to remove the most fragile manual steps before public testnet use: pasting derived token IDs, guessing purchase IDs after pack purchase, and running redemption fulfillment only from scripts.

This phase remains browser-wallet driven. It does not add server signing, relayers, indexers, production metadata, real shipping automation, or mainnet writes.

## Approved Direction

Use a testnet operations pass:

- Keep direct EIP-1193 wallet and viem helpers from Phase 4B.
- Add read helpers that scan known seeded inventory records because ERC-1155 ownership is not enumerable without an indexer.
- Let market and redemption forms fill token IDs from a connected wallet scan while preserving manual input for edge cases.
- Add a reveal panel for `PackSale.reveal(purchaseId)` so a successful pack purchase can move to the next testnet step from the dashboard.
- Add a redemption operator panel for admin status transitions on testnet.
- Update the runbook with a precise end-to-end smoke path and mainnet cutover checklist.

Alternative approaches considered:

- Indexer-first token picker: best long term, but too large for the immediate testnet readiness slice.
- Full admin console for inventory anchoring, drop creation, buyback quote management, and recipe creation: useful later, but too broad and risky before the core purchase-to-redemption rehearsal is stable.
- Script-only operations: safe for deployers, but it keeps the app from becoming a complete testnet QA surface.

## Product Scope

Phase 4C includes:

- A known-inventory token scanner that derives token IDs for the seeded/sample inventory set and reads the connected wallet balance for each candidate.
- Token picker controls for marketplace listing and redemption request panels.
- Manual token ID entry remains available for non-seeded test tokens.
- A pack reveal panel on the dashboard that calls `PackSale.reveal(purchaseId)` for a user-entered purchase ID.
- A redemption operations panel on `/admin/inventory` for `approve`, `markPacked`, `markShipped`, `complete`, and `cancel`.
- Clear copy that redemption operations require a wallet with `REDEMPTION_ADMIN_ROLE`.
- Runbook updates for deploy, seed, smoke, wallet QA, reveal, marketplace, Forge, redemption, and mainnet cutover.

Phase 4C excludes:

- Mainnet enablement.
- Drop creation or inventory anchoring from the web app.
- Buyback quote acceptance or treasury withdrawal panels.
- Indexer-backed full wallet inventory.
- Automated shipping label generation.
- Any real securities, fractional shares, or stock prize delivery.

## UX Principles

- Keep testnet-only language prominent.
- Make token lookup helpful but honest: it scans known seeded inventory only.
- Do not auto-request wallet accounts or trigger chain writes on page load.
- Use finance-grade action labels and summaries.
- Make admin-role requirements explicit before a wallet prompt opens.
- Keep manual token and request ID inputs visible so operators can test non-seeded data.
- No pressure copy, expected profit language, or gambling-style prompts.

## Architecture

Extend the existing `apps/web/src/lib/contracts` boundary:

- `abis.ts`: add read fragments for inventory token derivation and token metadata, plus write fragments for pack reveal and redemption admin transitions.
- `known-inventory-tokens.ts`: read-only scanner for known sample inventory candidates. It accepts a `ProtocolReadClient`, account, and registry contracts, and returns token IDs, balances, redeemability, grail status, and UI labels.
- `transaction-config.ts`: add null-safe request builders for pack reveal and redemption admin operations.
- `transactions.ts`: add `WriteRequest` variants for `packReveal`, `redemptionApprove`, `redemptionMarkPacked`, `redemptionMarkShipped`, `redemptionComplete`, and `redemptionCancel`.

Add focused UI components:

- `KnownInventoryTokenPicker`: client component that connects on explicit click, scans known seeded inventory, and calls `onSelectTokenId`.
- `PackRevealPanel`: wraps `PackSale.reveal(purchaseId)` in `TransactionActionPanel`.
- `RedemptionOpsPanel`: wraps testnet redemption admin transitions in `TransactionActionPanel`.

Update existing route components:

- `RevealPanel`: replace the old Phase 4A guard with the pack reveal panel.
- `MarketplaceListPanel`: add the token picker above the token ID input.
- `RedemptionRequestPanel`: add the token picker configured for redeemable tokens.
- `AdminInventoryConsole`: add the redemption operations panel and operations checklist.

## Data Flow

Token picker flow:

1. Component renders without requesting wallet accounts.
2. User clicks "Scan wallet inventory".
3. Component requests accounts through the injected wallet and reads `eth_chainId`.
4. If the wallet is not on Robinhood Chain Testnet, show a switch prompt or readable wrong-chain copy.
5. Once connected, derive each known inventory token ID through `InventoryRegistry.derivePhysicalTokenId(inventoryId)`.
6. Read `ItemToken.balanceOf(account, tokenId)` for each candidate.
7. Render only owned candidates by default, with empty-state copy when none are found.
8. Clicking "Use token" fills the parent token ID input.

Pack reveal flow:

1. Operator/user enters a positive purchase ID.
2. The panel requires wallet connection and Robinhood Chain Testnet.
3. The final action calls `PackSale.reveal(purchaseId)`.
4. Receipt UI follows the existing Phase 4B transaction states.

Redemption operations flow:

1. Operator selects an action mode.
2. Operator enters a positive request ID.
3. `markShipped` requires a tracking reference.
4. `cancel` requires a cancellation reason.
5. The panel submits the matching `RedemptionRegistry` method through the connected wallet.
6. Reverts are displayed as failed receipts, not confirmations.

## Error Handling

- Missing registry: keep scanner and admin panels read-only with the registry status message.
- Missing wallet: show wallet guidance and no provider request until click.
- Wrong chain: show testnet-only chain copy and let existing wallet-switch behavior handle transaction panels.
- No owned known inventory: "No seeded inventory tokens found for this wallet."
- Token scan RPC failure: show sanitized copy without raw RPC URL or provider payload.
- Missing purchase/request ID: disable final write and state the exact missing input.
- Missing tracking reference or cancellation reason: disable final write and state the required field.
- Contract revert: use the existing sanitized transaction failure copy.

## Testing

Use TDD for every behavior:

- Known inventory scanner derives token IDs and filters owned balances.
- Scanner returns sanitized degraded state on read failure.
- Token picker does not request wallet accounts on render.
- Token picker fills token ID after a successful scan and selection.
- Transaction helpers build pack reveal and redemption admin write requests.
- Route tests cover reveal, marketplace, redemption, and admin Phase 4C copy.
- Existing Phase 4B transaction tests continue to pass.

Verification commands:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Browser verification:

- Run the app on `http://localhost:64920`.
- Check `/`, `/market`, `/redemption`, `/forge`, `/vault`, and `/admin/inventory` at desktop and mobile sizes.
- Confirm no horizontal overflow.
- Confirm no wallet prompt appears until a connect, scan, or transaction button is clicked.
- Confirm Phase 4C panels are visible and testnet-only.

## Mainnet Migration

Phase 4C keeps the mainnet path explicit:

- Contract addresses still come only from deployment registries.
- Chain/RPC/explorer values still come from shared chain config and env.
- Token scanner is clearly seeded-inventory-only until an indexer replaces it.
- Mainnet must require a separate production registry, role review, operator wallet checklist, and legal/product review before enabling writes.
