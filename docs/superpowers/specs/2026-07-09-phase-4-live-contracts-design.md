# Phase 4 Live Contracts Design

## Summary

Phase 4 turns the Phase 3 demo app into a Robinhood Chain testnet-connected app. The first slice, Phase 4A, adds live contract awareness, wallet connection, chain switching, and guarded transaction surfaces while keeping testnet write actions explicit and safe.

The app already has a deployed Robinhood testnet registry and a local UI that presents drops, vault, marketplace, Forge, redemption, and admin inventory. This design connects that UI to live chain state without exposing server private keys or pretending that preview actions are final on-chain operations.

## Approved Direction

Use the live testnet foundation approach:

- Add direct EVM wallet connection for injected wallets such as Phantom, MetaMask, and compatible browser wallets.
- Add a small contract client layer that reads the deployed registry from the public web environment.
- Read live testnet state into the app for protocol health, drop counters, recipe counters, listing counters, redemption counters, token balances, and approval status where a user wallet is connected.
- Convert primary action areas from preview-only to connected but guarded states.
- Keep actual write transactions behind explicit confirmation panels and implement them as the next Phase 4B slice.

Alternative approaches considered:

- Full write-enabled app immediately: faster to demo, but riskier because pack, marketplace, Forge, and redemption flows each need separate confirmation, error, and post-transaction states.
- Indexer-first app: stronger long-term data model, but unnecessary for the first testnet app because the deployed contracts expose enough direct read state for basic readiness.
- Wallet library-first app with wagmi/rainbowkit: useful later, but the first slice can be smaller with direct EIP-1193 wallet handling and viem for public reads.

## Product Scope

Phase 4A includes:

- Wallet connection card in the app shell or dashboard.
- Add/switch Robinhood Chain Testnet through the wallet provider.
- Connected wallet address and chain mismatch status.
- Live protocol panel that reads deployed contract state from Robinhood testnet.
- Contract registry validation before any live read is attempted.
- Graceful demo fallback when the registry is missing, incomplete, unsupported, or an RPC call fails.
- User-token read surface for selected cards when a wallet is connected.
- Approval readiness indicators for marketplace and Forge operators.
- Guarded action panels for pack reserve, list item, craft recipe, and request redemption.
- Testnet-only disclaimers and no mainnet transaction prompts.

Phase 4A excludes:

- Sending pack, marketplace, Forge, or redemption transactions.
- Custodial wallet management.
- Server-side signing.
- Indexer service.
- Mainnet deployment.
- Real securities, stock, or fractional-share prize distribution.
- Production fulfillment automation.

Phase 4B can add transaction writes once Phase 4A is stable:

- Reserve pack with ETH.
- Approve/list item on marketplace.
- Approve/craft Forge recipe.
- Request redemption on-chain.
- Receipt-driven UI updates and activity entries.

## UX Principles

The connected app must feel finance-grade and human-made:

- Keep the Robinhood-inspired green, graphite, off-white, and restrained hacker terminal details from Phase 3.
- Use precise language: "testnet", "connected", "chain mismatch", "approval needed", and "ready for write flow".
- Use confirmations for every transaction-bearing action.
- Avoid pressure mechanics, dark casino language, auto-roll prompts, and expected-profit claims.
- Show odds, inventory backing, and operator-controlled testnet randomness disclosures near pack actions.
- Make wallet connection useful without blocking browsing; read-only views still work for users who have not connected.

## Architecture

Add a small `apps/web/src/lib/contracts` boundary:

- `abis.ts`: minimal ABI fragments for read functions used by the web app.
- `registry.ts`: validates deployment status and exposes typed contract addresses.
- `public-client.ts`: builds a viem public client for Robinhood testnet using the shared chain config and an optional public RPC env variable.
- `live-state.ts`: reads protocol counters and readiness from contracts with graceful error handling.
- `wallet.ts`: browser-safe EIP-1193 helpers for connect, switch chain, add chain, and format wallet status.

Add focused UI components:

- `WalletConnectPanel`: client component for injected wallet connection and chain switching.
- `LiveProtocolPanel`: server component for contract state and registry health.
- `ActionGuardPanel`: reusable UI that tells users whether an action is preview-only, needs a wallet, needs the right chain, or is ready for the Phase 4B transaction flow.

The current route structure remains unchanged. The dashboard gets the live protocol and wallet surfaces first; market, Forge, redemption, and reveal panels reuse the guard state without rewriting their core layout.

## Data Flow

Server/read flow:

1. Load `NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY`.
2. Resolve deployment readiness with the existing deployment resolver.
3. Validate all required contract addresses.
4. Create a public viem client for Robinhood testnet.
5. Read low-cost protocol counters from deployed contracts.
6. Return a display model with `ready`, `degraded`, or `demo` state.

Client/wallet flow:

1. Detect `window.ethereum`.
2. Request accounts only when the user clicks connect.
3. Read `eth_chainId` and `eth_accounts`.
4. Offer `wallet_switchEthereumChain` to Robinhood testnet.
5. If the chain is unknown to the wallet, offer `wallet_addEthereumChain`.
6. Re-render connected status after account or chain changes.

User wallet state must never depend on the deployer private key. The web app only uses the user's injected wallet provider for account and future transaction actions.

## Error Handling

- Missing registry: show demo mode and keep all live reads disabled.
- Incomplete registry: show the missing contract names and keep guarded actions locked.
- Unsupported chain ID: show unsupported deployment status and keep guarded actions locked.
- RPC failure: show degraded live state with the failed read reason and keep local app browsing available.
- Wallet missing: show install/open wallet guidance without blocking read-only browsing.
- User rejects connection or switch: show a calm rejected state and allow retry.
- Wrong chain: show the connected address, the current chain, and a switch button.

No error path should expose private keys, raw stack traces, or internal env values in the UI.

## Testing

Use TDD for behavior that matters:

- Deployment registry validation returns live-contract readiness only for a complete Robinhood testnet registry.
- Public live-state reader returns demo/degraded models instead of throwing when registry or RPC is unavailable.
- Wallet helpers format chain IDs, switch parameters, and provider errors correctly.
- Wallet panel renders missing wallet, disconnected, connected, rejected, and wrong-chain states.
- Dashboard renders live protocol state and guarded actions.

Verification commands:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Browser verification:

- Run the local dev server with the testnet registry in `.env.local`.
- Check dashboard, vault, market, Forge, redemption, and admin routes on desktop and mobile.
- Confirm the status rail reports `testnet / 46630 / ready`.
- Confirm wallet connection UI does not request accounts on page load.
- Confirm guarded actions are visible, readable, and cannot send transactions in Phase 4A.

## Mainnet Migration

Phase 4A must keep mainnet migration straightforward:

- Chain IDs and RPC URLs come from `@gacha/shared`.
- The deployment registry remains the only source of contract addresses.
- Browser RPC can be changed with a public env variable.
- Write flows in Phase 4B must branch from the same registry and chain helpers.
- Mainnet enablement should require changing deployment registry and chain mode, not rewriting UI state.
