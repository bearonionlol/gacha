# Robinhood Chain Gacha Vault Design

## Summary

Build a public testnet production-ready gacha collectibles dApp for Robinhood Chain testnet. The product models vaulted real-world graded trading cards using original fictional card IP, realistic grading metadata, on-chain ownership, marketplace liquidity, instant testnet buyback, trade-up crafting, and redemption request workflows.

The app should feel like a premium on-chain collectibles terminal: credible enough for real-world asset collectors, fast and fun enough for consumer onboarding, and transparent enough to avoid predatory loot-box patterns.

## Goals

- Ship an end-to-end Robinhood Chain testnet dApp, not a mocked prototype.
- Support wallet connect, network add/switch, pack purchase, pack reveal, collection management, marketplace listings, buyback, trade-up crafting, and redemption requests.
- Use original fictional graded trading cards with PSA-style metadata: grade, cert ID, population count, condition notes, vaulted status, custodian label, set, rarity, and redeemability.
- Make the user loop engaging through collection depth, reveal anticipation, set progress, duplicate trade-ups, market activity, and redemption milestones.
- Use transparent odds, explicit testnet randomness disclosure, no hidden auto-roll loops, and no misleading expected-value or profit claims.

## Non-Goals

- No mainnet launch in the first implementation.
- No real trading card names, logos, images, or licensed IP.
- No real physical fulfillment backend. The testnet app models redemption status and emits operational events.
- No production-secure randomness claim unless a supported verifiable randomness provider is integrated.
- No full order book or auction system in the MVP.
- No Robinhood branding, logos, or official-affiliation presentation.

## External Facts And Constraints

- Robinhood Chain is EVM-compatible and supports standard Solidity tooling.
- Robinhood Chain testnet uses chain ID `46630`, ETH as the gas token, and a public testnet RPC at `https://rpc.testnet.chain.robinhood.com`.
- Robinhood Chain documentation recommends deploying to testnet first and verifying contracts against the testnet Blockscout API.
- Robinhood's public visual identity notes emphasize black, white, neutrals, and purposeful Robin Neon accents. The dApp may use this as inspiration, but must not imply official Robinhood affiliation.
- Chainlink documentation lists Robinhood Chain support for CCIP, Data Streams, and LINK contracts, but the builder quick-links table does not list VRF for Robinhood Chain at spec time. The randomness design must be adapter-based.

Sources:

- https://docs.robinhood.com/chain/connecting/
- https://docs.robinhood.com/chain/deploy-smart-contracts/
- https://docs.robinhood.com/chain/
- https://www.robinhood.com/us/en/newsroom/a-new-visual-identity
- https://docs.chain.link/builders-quick-links
- https://docs.chain.link/vrf

## Product Architecture

Use a monorepo with three main areas:

- `apps/web`: Next.js dApp with TypeScript, Tailwind, wallet connection, contract reads/writes, event-driven UI, and premium responsive layouts.
- `packages/contracts`: Hardhat Solidity project with deployment, verification, tests, and Robinhood Chain testnet config.
- `packages/metadata`: deterministic fictional card set, pack tables, recipe tables, buyback quote tables, and metadata/image generation inputs.

The MVP should work locally against a Hardhat chain and against Robinhood Chain testnet. The testnet deployment should include contract addresses, explorer links, deployment metadata, and smoke-test scripts.

## Visual And UX Direction

Approved direction: Vault Market base with arcade reveal moments.

The main UI should be premium and professional:

- Base colors: black, off-white, graphite, cool neutrals, and precise neon green accents.
- Hacker energy through monospace accents, live chain event feeds, block-height badges, cert hashes, subtle grid lines, command-style status labels, and compact telemetry.
- No generic AI-looking landing page, oversized marketing hero, or stock illustration feel.
- No casino imagery, confetti spam, or cluttered reward banners.
- Motion is reserved for pack reveal, rarity shimmer, trade-up completion, and transaction state changes.
- The first screen should be the app experience: drop lobby, collection summary, pack action, activity feed, and market signals.

Core screens:

- Drop lobby
- Pack purchase and reveal
- Collection vault
- Card detail and provenance
- Marketplace
- Trade-up crafting
- Redemption request detail
- Admin/testnet operations surface for owner-only drop, quote, recipe, and redemption management

## Gameplay Loop

1. User connects a wallet and switches to Robinhood Chain testnet.
2. User enters the active drop and reviews odds, pack price, remaining supply, chase cards, and vault proof metadata.
3. User buys and opens a pack.
4. Reveal shows card art, rarity, grade, population count, cert ID, floor estimate, redemption status, and set impact.
5. User chooses one of the immediate next actions:
   - Keep in vault
   - List on marketplace
   - Accept instant testnet buyback quote
   - Use in trade-up crafting
   - Request redemption if eligible
6. User returns to the collection and marketplace loop, driven by set progress, duplicate pressure, chase goals, and live market activity.

Retention should come from progress and decisions, not opaque spending pressure:

- Set completion progress
- Daily chase missions
- Activity streak counters that do not unlock hidden odds
- Duplicate trade-up paths
- Provenance and vault badges
- Recent sale/listing activity
- Redemption timeline milestones

## Smart Contract Model

### CardToken

ERC-1155 token for cards and packs.

Responsibilities:

- Mint and burn cards/packs through authorized contracts.
- Store token URI by token ID or expose a deterministic URI base.
- Separate card token IDs from pack token IDs.
- Support operator roles for sale, crafting, buyback, and redemption contracts.

### PackSale

Sells and opens packs.

Responsibilities:

- Configure pack price, supply, active state, and drop table.
- Accept ETH on Robinhood Chain testnet.
- Request randomness through an adapter.
- Mint revealed cards after randomness resolution.
- Emit events for purchase, randomness request, reveal, and drop updates.

Randomness:

- Implement a `IRandomnessProvider` interface.
- Use a transparent testnet commit-reveal provider for public testnet.
- Use an admin/mock provider only for local tests.
- Keep a VRF-compatible adapter boundary so the provider can be replaced when Robinhood Chain VRF support exists.
- UI must label the provider as testnet/demo randomness unless a verifiable provider is integrated.

### Marketplace

Fixed-price escrow marketplace.

Responsibilities:

- Create listings for ERC-1155 card quantities.
- Escrow listed cards.
- Allow buy-now purchases with ETH.
- Transfer proceeds to sellers and fees to treasury if enabled.
- Support cancellation and partial fills.
- Emit listing, purchase, cancellation, and fee events.

### BuybackVault

Instant testnet buyback flow.

Responsibilities:

- Store quote values by token ID or rarity tier.
- Allow users to accept a quote and transfer/burn the card into the vault.
- Pay testnet ETH from contract balance.
- Emit quote update and buyback events.
- Enforce pause and treasury funding checks.

### TradeUpCrafting

Burns eligible cards for higher-tier packs or cards.

Responsibilities:

- Store transparent recipe definitions.
- Validate user balances and approvals.
- Burn recipe inputs.
- Mint configured output pack/card.
- Emit recipe and craft events.

### RedemptionRegistry

Models physical redemption requests.

Responsibilities:

- Verify requester owns the eligible card.
- Lock, escrow, or mark the token as pending redemption.
- Emit request events with token ID, quantity, requester, and metadata pointer.
- Track states such as requested, approved, packed, shipped, completed, and cancelled.
- Allow admin updates for testnet operational flow.

### Shared Controls

Contracts should use:

- OpenZeppelin access control.
- Pausable emergency stops where appropriate.
- Reentrancy guards for payable and transfer flows.
- Custom errors.
- Full event coverage for indexer and UI state.
- Clear treasury and admin roles: owner, operator, metadata manager, treasury, pauser.

## Data And Metadata

The first drop is a fictional set named `Genesis Graders`.

Metadata fields:

- Token ID
- Name
- Set
- Rarity
- Grade
- Cert ID
- Population count
- Condition notes
- Vault status
- Custodian label
- Redemption eligibility
- Image URI
- Animation URI field, empty string unless a generated animation asset exists
- Attributes for marketplace filtering

Images should be generated by a deterministic local asset script from bespoke templates, then exported as static SVG or PNG files. The implementation should include local metadata fallback and IPFS-ready JSON output.

## Indexing And Frontend Data

Use direct contract reads plus a lightweight Node event cache package that reads contract events from configured deployment blocks. The web app can run without the cache in degraded mode, but the public testnet experience should use the cache for activity, marketplace, and redemption timelines.

The UI needs responsive, production-grade states for:

- Loading contract data
- Wrong network
- Wallet disconnected
- Insufficient ETH
- Transaction pending
- Transaction failed or rejected
- Indexer lag
- Empty collection
- Sold out drop
- Paused contracts
- Redemption pending

## Testnet Deployment Requirements

The repo should include:

- `.env.example`
- Hardhat network config for Robinhood Chain testnet
- Deployment scripts
- Verification scripts for Blockscout
- Seed scripts for metadata, pack tables, recipes, and buyback quotes
- Smoke-test scripts for a deployed testnet environment
- Deployment registry JSON containing chain ID, contract addresses, deployer, tx hashes, and explorer URLs
- README covering local setup, testnet deployment, verification, seeding, and reset/reseed operations

## Testing Strategy

Contract tests should cover:

- Role setup and access failures
- ERC-1155 mint/burn behavior
- Pack purchase and reveal lifecycle
- Randomness provider adapter behavior
- Marketplace list, cancel, buy, partial fill, and proceeds
- Buyback funding, quote validation, payout, and failure states
- Trade-up recipe validation, burn, and mint
- Redemption request lifecycle
- Pausable and reentrancy-sensitive flows

Frontend tests should cover:

- Network config and chain switching helpers
- Metadata formatting
- Odds and quote displays
- Marketplace filtering/sorting helpers
- Major empty/error states for wallet, network, balances, transactions, marketplace, collection, and redemption

Manual verification should include:

- Local Hardhat flow from deploy to reveal to marketplace purchase.
- Robinhood Chain testnet deploy and contract verification.
- Browser walkthrough with connected wallet.
- Desktop and mobile responsive screenshots.

## Safety, Trust, And Compliance Notes

The app should be fun, but not manipulative:

- Display odds before purchase.
- Display testnet randomness disclosure.
- Display total transaction cost before purchase.
- Avoid auto-roll or hidden spend prompts.
- Avoid implying guaranteed profit, positive EV, or investment return.
- Do not market fictional cards as real vaulted assets.
- Keep redemption copy explicit that testnet redemption is a modeled workflow.
- Avoid official Robinhood branding unless permission is obtained.

## Implementation Defaults

- `Genesis Graders` should include 120 card definitions.
- Rarity distribution should be common, uncommon, rare, epic, legendary, and mythic.
- Pack tables should make odds explicit in basis points and should be stored in seed data and contract config.
- Static card images should be generated locally from deterministic templates and committed or emitted into a reproducible assets directory.
- The event cache should live in a separate package so it can run as a worker or CLI.
- Include a small owner-only admin/testnet operations UI in the first implementation, backed by the same scripts used for deployment and seeding.

## Approval Status

Approved by user during brainstorming:

- Robinhood Chain testnet target.
- Real-world collectible vault/redemption model.
- Original fictional graded trading cards.
- Vault Market visual foundation with arcade reveal module.
- Premium and professional Robinhood-inspired hacker aesthetic.
- Immediate reveal actions: keep, list, redeem, instant buyback, and trade-up crafting.
- Fixed-price buy-now marketplace for MVP.
- Public testnet production-ready scope.
