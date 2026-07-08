# Gacha Super App Design

## Summary

Build a production-ready testnet gacha super app on Robinhood Chain using real Pokémon and One Piece inventory from the beginning. The platform combines vaulted physical collectibles, pack ripping, P2P marketplace liquidity, configurable crafting through The Forge, redemption workflows, buyback, and a simulated fantasy stock arena.

The core wedge is:

> A finance-grade gacha exchange where every pull becomes a strategic asset.

The product should not feel like a generic NFT dApp or casino loot-box site. It should feel like a premium collectible trading terminal where users constantly decide whether to keep, list, buy back, redeem, craft, hold, or use an item in a broader game economy.

## Goals

- Launch a full production-ready testnet app on Robinhood Chain testnet.
- Use real Pokémon and One Piece inventory data from day one.
- Make the system easy to migrate from Robinhood Chain testnet to Robinhood Chain mainnet.
- Support owner/admin inventory intake because no formal inventory spreadsheet exists yet.
- Support raw cards, graded cards, sealed products, promos, slabs, and future collectible categories.
- Support P2P fixed-price marketplace listings in V1.
- Make The Forge a central gameplay tab with drag-and-drop crafting and a recipe book.
- Include Forge abuse controls so recipes can be tuned, paused, simulated, capped, and reviewed.
- Include a fantasy stock arena as a simulated competition layer, not real securities or cash-prize wagering.
- Preserve clear safety boundaries: transparent odds, no hidden auto-roll loops, no misleading expected-value claims, no official Pokémon, One Piece, or Robinhood affiliation claims.

## Non-Goals

- No real securities or fractional shares as gacha prizes.
- No cash-prize paid fantasy stock contests in V1.
- No sponsored market seasons for now.
- No official Pokémon, One Piece, Bandai, Toei, Shueisha, Nintendo, Game Freak, Creatures, or Robinhood partnership claims unless a license or partnership exists.
- No platform-managed grading submission in V1.
- No mainnet deployment until legal, inventory, fulfillment, custody, and risk controls are ready.
- No full order book in V1. Fixed-price P2P listings are enough for the first production-testnet release.

## External Facts And Constraints

- Robinhood Chain testnet uses chain ID `46630`.
- Robinhood Chain mainnet uses chain ID `4663`.
- Robinhood Chain is EVM-compatible and supports standard Solidity tooling.
- Robinhood Stock Tokens are tokenized securities with jurisdiction restrictions. They should not be distributed as random gacha prizes.
- Pokémon and One Piece are licensed brands. The platform can model authentic resale inventory, but must avoid official-affiliation language and must use clear disclaimers unless licensing exists.

Sources:

- https://docs.robinhood.com/chain/connecting/
- https://docs.robinhood.com/chain/deploy-smart-contracts/
- https://docs.robinhood.com/chain/stock-tokens/
- https://www.investor.gov/introduction-investing/investing-basics/investment-products/tokenized-securities
- https://press.pokemon.com/en/Assets-Use-Terms
- https://en.onepiece-cardgame.com/topics/009.php
- https://www.toei-animation-usa.com/faq.html

## Product Positioning

The app should be positioned as a collectible vault and gacha exchange, not as an official branded Pokémon or One Piece product.

Working product identity:

- Platform brand: ownable, neutral, premium, and not tied to licensed brands.
- Visual direction: black, off-white, graphite, precise neon green accents, dense finance-terminal layouts, subtle hacker styling.
- Core message: every card has a market, every duplicate has a recipe, every collection becomes a portfolio.

The app should use real inventory names only as item descriptors, for example:

- `Pokémon TCG Charizard ex, raw`
- `One Piece Card Game Manga Luffy, PSA 10`

It should include visible disclaimers:

- Not affiliated with or endorsed by The Pokémon Company, Nintendo, Creatures, Game Freak, Shueisha, Toei Animation, Bandai, or Robinhood.
- Testnet ownership and payments are simulations unless the user is operating under separate off-chain terms.
- Fantasy stock arena assets are simulated game items and are not securities.

## Core User Loop

The primary loop is:

1. User joins a drop.
2. User opens a pack.
3. User reveals a real inventory-backed item or game item.
4. User immediately chooses a next action:
   - Keep in vault
   - List on P2P marketplace
   - Accept buyback quote
   - Redeem physical item
   - Use in The Forge
   - Hold for a future recipe
   - Use related fantasy stock shards in Stock Arena
5. User returns to vault, marketplace, Forge, drops, or stock arena.

The reveal should be the beginning of the gameplay, not the end.

## Real Inventory Model

Because the current inventory is not formalized in a spreadsheet, V1 must include owner/admin inventory intake.

Each physical item should have:

- `inventoryId`: stable internal ID that survives testnet to mainnet migration.
- `brand`: Pokémon, One Piece, or future supported brand.
- `category`: raw card, graded card, sealed product, promo, slab, box, accessory, or future category.
- `cardName`
- `setName`
- `cardNumber`
- `language`
- `edition`
- `variant`
- `rawConditionEstimate`
- `conditionNotes`
- `gradingCompany`
- `grade`
- `certNumber`
- `certUrl`
- `photoUrls`
- `photoHash`
- `vaultLocationLabel`
- `custodyStatus`
- `redeemable`
- `marketEstimate`
- `buybackQuote`
- `grailTier`
- `craftingTags`
- `dropEligibility`
- `legalDisclaimer`
- `createdAt`
- `updatedAt`

Graded-only fields should be nullable for raw cards. Raw cards remain first-class collectible items, not just crafting material.

## Inventory And Custody Lifecycle

Every item moves through explicit states:

1. `draft`
2. `photographed`
3. `verified`
4. `vaulted`
5. `drop_ready`
6. `tokenized`
7. `user_owned`
8. `listed`
9. `buyback_held`
10. `redemption_pending`
11. `redeemed`

Rules:

- Only `vaulted` or `drop_ready` items can be assigned to drops.
- Only `verified` items can become `vaulted`.
- Only `drop_ready` items can be tokenized through a pack drop.
- Listed items are escrowed and cannot be redeemed or crafted.
- Redemption-pending items cannot be listed or crafted.
- Redeemed items cannot re-enter drops unless explicitly re-vaulted as a new inventory record.
- Buyback-held items can be recycled into future drops only after admin review.

## Raw And Graded Item Treatment

Raw cards should support multiple roles:

- Raw common: accessible pull, set filler, listing candidate, crafting input.
- Raw rare: meaningful collection piece, recipe input, market item.
- Raw grail: high-value chase item, vault trophy, listing candidate, redemption candidate.
- Grade candidate: raw item that may be valuable if the user redeems and submits it to a grader independently.

Graded cards should support:

- Grade and cert display.
- Slab photo display.
- Cert URL if available.
- Population and market comp fields when available.
- Higher vault prestige weighting.
- Default grail-protection in The Forge.

No platform-managed grading submission in V1. The app can provide:

- Grading candidate score.
- Exportable notes.
- Redeem-to-grade-yourself guidance.
- Manual re-vault intake flow for users who return with a graded card.

## Admin Inventory Console

V1 must include an owner/admin inventory console.

Required capabilities:

- Create item.
- Edit item.
- Upload or link photos.
- Hash photos.
- Mark item photographed.
- Mark item verified.
- Mark item vaulted.
- Mark item drop-ready.
- Set grail tier.
- Set market estimate.
- Set buyback quote.
- Add crafting tags.
- Set redeemability.
- View lifecycle history.
- Export inventory JSON/CSV.

CSV export is required in V1. CSV import is a post-V1 enhancement. Manual intake is the source of truth for V1.

## Pack Drops

Pack drops are configured from verified, vaulted, drop-ready inventory and game items.

Drop configuration:

- Drop ID
- Name
- Start/end time
- Pack price
- Max supply
- Odds table
- Eligible inventory pool
- Eligible game-item pool
- Reveal categories
- Sold-out behavior
- Redemption disclosure
- Testnet/mainnet mode

Pack output categories:

- Physical inventory item token
- Crafting catalyst
- Market shard
- Fantasy stock strategy item
- Trade-up pack

The UI must display:

- Odds before purchase
- Testnet randomness disclosure
- Pack price and gas estimate
- Inventory-backed item disclosures
- No guaranteed-profit or expected-value claims

## P2P Marketplace

V1 marketplace is fixed-price buy-now.

Capabilities:

- List tokenized item at fixed price.
- Escrow token during listing.
- Cancel listing.
- Buy listing.
- Transfer seller proceeds minus protocol fee.
- Transfer token to buyer.
- Show listing history.
- Show floor estimate.
- Show buyback quote.
- Show redemption status.
- Show Forge recipe utility.

Future marketplace expansion:

- Offers
- Auctions
- Bundle listings
- Swaps
- Collection bids
- Recipe-aware bid suggestions

## The Forge

The Forge is the main differentiator and should be treated as a primary app tab.

Interface:

- Left: inventory tray with owned cards, shards, catalysts, packs, raw items, graded items.
- Center: drag-and-drop crafting grid.
- Right: output preview.
- Side drawer: recipe book.
- Bottom: missing ingredient market helper.

Interaction requirements:

- Drag items into grid.
- Auto-fill from selected recipe.
- Clear grid.
- Preview output.
- Show required fee.
- Show burned/escrowed inputs.
- Show whether high-value items are protected.
- Submit onchain craft.
- Show craft result animation.

Recipe book requirements:

- Filter by craftable now.
- Filter by missing one item.
- Filter by TCG.
- Filter by stock fantasy.
- Filter by raw.
- Filter by graded.
- Filter by seasonal.
- Filter by prestige.
- Show locked recipes as silhouettes.
- Link missing ingredients to marketplace listings.
- Show output odds when output is a pack.
- Show input market estimate and output estimate when available.

The Forge can use a familiar grid-crafting pattern, but must not copy Minecraft branding, textures, sounds, or terminology.

## Forge Abuse Controls

Recipes must be configurable and protected from abuse.

Recipe lifecycle:

1. `draft`
2. `simulated`
3. `admin_reviewed`
4. `scheduled`
5. `active`
6. `paused`
7. `retired`

Recipe fields:

- `recipeId`
- `name`
- `inputRules`
- `outputRule`
- `fee`
- `startTime`
- `endTime`
- `maxCraftsTotal`
- `maxCraftsPerWallet`
- `requiresManualReview`
- `excludedGrailTiers`
- `allowedBrands`
- `allowedCategories`
- `allowedTags`
- `burnPolicy`
- `escrowPolicy`
- `marketEstimateWarningThreshold`

Controls:

- Admin can create, update, pause, and retire recipes.
- Recipes can require specific tags, rarity tiers, brands, sets, raw/graded status, or catalysts.
- Recipes can cap total crafts.
- Recipes can cap crafts per wallet.
- Recipes can exclude grails by default.
- Recipes can require manual review for high-value outputs.
- Recipes can be simulated before activation.
- Protocol can pause the entire Forge.

Abuse prevention goals:

- Prevent infinite EV loops.
- Prevent draining high-value outputs with cheap inputs.
- Prevent bots from mass-crafting at recipe launch.
- Prevent accidental burning of valuable grails.
- Prevent recipe-driven market manipulation from causing uncontrolled losses.

User protection:

- Warn when input items are high-value.
- Warn when input items are grails.
- Show input market estimate.
- Require extra confirmation for valuable inputs.
- Make permanent consumption clear.

## Buyback

Buyback is optional and protocol-controlled.

Capabilities:

- Admin sets quote per inventory item, tag, category, or tier.
- User can accept quote if item is eligible and not listed/redeemed/crafting-locked.
- Protocol receives token and pays user.
- Item enters `buyback_held`.
- Admin decides whether it can return to future drops.

Buyback should not imply guaranteed liquidity for every item.

## Redemption

Redemption lets the token holder request the physical item.

Lifecycle:

1. User requests redemption.
2. Token is locked, escrowed, burned, or marked redemption-pending depending on final contract design.
3. Admin reviews.
4. Status changes through fulfillment steps.
5. Item becomes redeemed.

Statuses:

- `requested`
- `approved`
- `packed`
- `shipped`
- `completed`
- `cancelled`

Testnet copy must state that fulfillment is modeled unless separate off-chain terms apply.

## Fantasy Stock Arena

Stock Arena is a simulated game layer, not a real securities product.

V1 behavior:

- Weekly seasons.
- Free entry.
- Each user receives a paper bankroll, e.g. `100,000 Paper USD`.
- Users build fantasy portfolios from simulated assets and sectors.
- Scoring uses market movement data.
- Users compete in global, friend, and faction leaderboards.
- Gacha packs can include market shards and strategy items.
- Rewards are badges, cosmetics, crafting materials, profile upgrades, or testnet perks.

No V1 behavior:

- No real securities prizes.
- No tokenized stock prizes.
- No cash-prize paid contests.
- No sponsored market seasons.
- No promise of investment performance.

Example fantasy assets:

- Mega Cap Tech
- Semiconductor Basket
- AI Infrastructure
- Energy Basket
- Broad Market Index
- Volatility Index
- Crypto Equities Basket

Example game items:

- AI Compute Shard
- Semiconductor Shard
- Momentum Signal
- Bear Shield
- Index Catalyst
- Rebalance Token

Revenue contribution:

- Makes packs more useful.
- Creates shard demand.
- Creates marketplace volume.
- Creates Forge activity.
- Supports season pass demand.
- Keeps users returning during market hours.

## Revenue Model

V1 and near-term revenue sources:

- Pack sale revenue.
- Marketplace protocol fee.
- Forge crafting fee.
- Buyback spread.
- Redemption/service fee.
- Season pass.
- Premium analytics.
- Cosmetic/profile upgrades.

Excluded for now:

- Sponsored market seasons.
- Paid cash-prize fantasy contests.
- Random real securities prizes.

## Smart Contract Architecture

Contracts should be network-parameterized and mainnet-ready:

- `ItemToken`: ERC-1155 or ERC-721/1155 hybrid design for physical inventory-backed items and game items.
- `PackSale`: pack purchase, randomness request, reveal, and mint/assign flow.
- `RandomnessProvider`: adapter interface with testnet provider and future verifiable provider compatibility.
- `Marketplace`: fixed-price escrow marketplace.
- `BuybackVault`: quote acceptance and protocol-held inventory.
- `Forge`: configurable recipe validation and crafting.
- `RedemptionRegistry`: redemption request and status tracking.
- `InventoryRegistry`: onchain anchor for inventory IDs, hashes, and lifecycle-critical commitments.
- `Treasury`: fee collection or configured treasury address.

Contracts should include:

- Role-based access control.
- Pausing.
- Reentrancy protection.
- Custom errors.
- Full event coverage.
- Per-network deployment registry.
- Upgrade strategy documented before mainnet.

## Offchain Architecture

Monorepo layout:

- `apps/web`: Next.js app, wallet, admin console, marketplace, Forge, stock arena.
- `packages/contracts`: Solidity contracts, tests, deployment scripts, verification scripts, smoke tests.
- `packages/inventory`: inventory schema, validation, import/export, photo hash utilities.
- `packages/metadata`: token metadata builder.
- `packages/indexer`: event cache for pulls, listings, crafts, redemptions, buybacks.
- `packages/shared`: chain config, constants, formatters, schemas.

Admin/offchain responsibilities:

- Inventory intake.
- Photo hashing.
- Drop construction.
- Recipe simulation.
- Quote management.
- Redemption operations.
- Deployment registry updates.
- Mainnet migration export.

## Mainnet-Ready Testnet Requirements

The app should support both:

- `robinhoodTestnet`, chain ID `46630`
- `robinhoodMainnet`, chain ID `4663`

Design rules:

- No hardcoded testnet assumptions in contracts.
- Chain ID passed through config.
- Per-network deployment registry.
- Per-network feature flags.
- Stable inventory IDs across testnet and mainnet.
- Testnet metadata export can be reused for mainnet after review.
- Deployment scripts support both networks.
- Seeding scripts support both networks.
- Smoke tests support both networks.
- Frontend reads active network config.
- Indexer reads deployment registry by network.

Mainnet migration should be:

1. Freeze production-testnet inventory snapshot.
2. Legal and operational review.
3. Export inventory registry.
4. Deploy mainnet contracts.
5. Verify contracts.
6. Seed config.
7. Anchor inventory hashes.
8. Run smoke tests.
9. Run private beta.
10. Enable public mainnet UI.

## UX Requirements

The app should include:

- Drop lobby.
- Pack reveal.
- Vault portfolio.
- Inventory/card detail.
- P2P marketplace.
- The Forge.
- Recipe book.
- Redemption flow.
- Buyback flow.
- Fantasy Stock Arena.
- Collector profile.
- Activity feed.
- Owner/admin inventory console.
- Owner/admin recipe console.
- Owner/admin drop console.

The first screen should be the app experience, not a marketing landing page.

## Safety And Compliance Requirements

The UI must:

- Show odds before pack purchase.
- Show testnet randomness disclosure.
- Show transaction costs.
- Show redemption status.
- Show whether the current mode is testnet or mainnet.
- Show licensed-brand disclaimers.
- Show fantasy stock arena disclaimers.
- Avoid guaranteed-profit language.
- Avoid positive-EV claims.
- Avoid official-affiliation language.
- Avoid dark-pattern auto-roll or hidden spend prompts.

Legal review is required before mainnet launch, especially for:

- Pokémon and One Piece resale presentation.
- Physical custody and redemption terms.
- Buyback mechanics.
- Paid packs.
- Fantasy stock competitions.
- Mainnet payments.
- Jurisdiction-specific restrictions.

## Build Phases

### Phase 1: Inventory Foundation

- Admin intake.
- Inventory schema.
- Photo hashing.
- Lifecycle states.
- Export/import foundation.
- Real Pokémon/One Piece data model.

### Phase 2: Testnet Protocol

- Item token.
- Pack sale.
- Randomness adapter.
- Marketplace.
- Buyback.
- Redemption.
- Configurable Forge.
- Deployment registry.

### Phase 3: Premium User App

- Wallet onboarding.
- Drop lobby.
- Pack reveal.
- Vault portfolio.
- Item detail.
- Marketplace.
- Buyback and redemption flows.
- Activity feed.

### Phase 4: The Forge

- Drag/drop grid.
- Recipe book.
- Auto-fill.
- Missing ingredient market links.
- Recipe simulation and safety states.
- Craft transaction flow.

### Phase 5: Fantasy Stock Arena

- Paper bankroll.
- Weekly seasons.
- Friend, global, and faction leaderboards.
- Simulated assets.
- Market shards.
- Strategy items.
- Badges and cosmetics.

### Phase 6: Production Readiness

- Admin operations.
- Risk controls.
- Legal/IP disclaimers.
- Full smoke tests.
- Testnet launch.
- Mainnet migration runbook.

## Testing And Verification

Contract tests:

- Pack purchase and reveal.
- Marketplace list, cancel, and buy.
- Buyback eligibility and payout.
- Redemption lifecycle.
- Forge recipe validation.
- Recipe caps and pause controls.
- Inventory hash anchoring.
- Role access failures.
- Reentrancy-sensitive flows.

Frontend tests:

- Inventory lifecycle views.
- Admin intake validation.
- Pack odds display.
- Pack reveal actions.
- Marketplace states.
- Forge drag/drop and recipe autofill.
- High-value Forge warnings.
- Fantasy stock scoring helpers.
- Network switching.
- Testnet/mainnet mode banners.

Manual verification:

- Real inventory item intake.
- Testnet tokenization.
- Pack drop from real inventory pool.
- User pull to vault.
- User listing and P2P purchase.
- User craft through The Forge.
- User redemption request.
- User fantasy stock season entry.
- Mobile and desktop layout checks.

## Approval Status

Approved during brainstorming:

- Use real Pokémon and One Piece inventory from the beginning.
- Start with admin-first inventory intake because no structured inventory exists yet.
- Build production-ready on Robinhood Chain testnet.
- Make migration to Robinhood Chain mainnet easy.
- Include P2P fixed-price marketplace.
- Treat raw grails as first-class collectible items.
- No platform-managed grading submission in V1.
- Make The Forge a central Minecraft-inspired drag/drop crafting interface without copying Minecraft branding.
- Include configurable Forge abuse controls.
- Include fantasy stock arena with free paper portfolios, points, friends, and leaderboards.
- Exclude sponsored market seasons for now.
