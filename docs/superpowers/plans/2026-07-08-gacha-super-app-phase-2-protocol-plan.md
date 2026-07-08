# Gacha Super App Phase 2 Testnet Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Robinhood Chain-compatible testnet protocol layer for inventory anchoring, inventory-backed tokens, drops, marketplace escrow, buyback, Forge recipes, and redemption.

**Architecture:** Add a `packages/contracts` Hardhat package with Solidity contracts that keep physical inventory IDs stable across testnet and mainnet. The protocol uses ERC-1155 tokens for physical inventory items and game items, a registry to anchor offchain inventory hashes, role-gated operational contracts, per-network deployment scripts, and tests that enforce every lifecycle-critical action.

**Tech Stack:** pnpm workspaces, TypeScript, Hardhat, Solidity 0.8.28, OpenZeppelin Contracts, ethers, Chai, dotenv, @gacha/shared Robinhood Chain config.

---

## Phase Scope

This phase creates the protocol package only. It does not build the Next.js UI, indexer, metadata package, fantasy stock arena, or production mainnet deployment.

The contracts must be mainnet-ready by configuration:

- Network config supports `hardhat`, `localhost`, `robinhoodTestnet`, and `robinhoodMainnet`.
- Deployed addresses are written to `deployments/<network>.json`.
- Inventory IDs are strings that match `packages/inventory` records.
- Physical token IDs are deterministically derived from inventory IDs.
- No contract includes brand-affiliation language or fantasy stock securities claims.

## File Structure

- `packages/contracts/package.json`: package scripts and dependencies.
- `packages/contracts/tsconfig.json`: TypeScript config for tests and scripts.
- `packages/contracts/hardhat.config.ts`: compiler, network, etherscan/custom chain, and path config.
- `packages/contracts/contracts/InventoryRegistry.sol`: anchors inventory IDs, inventory hashes, metadata URIs, redeemable flags, grail protection, and tokenization records.
- `packages/contracts/contracts/ItemToken.sol`: ERC-1155 token for physical inventory-backed items and game items.
- `packages/contracts/contracts/randomness/IRandomnessProvider.sol`: randomness adapter interface used by `PackSale`.
- `packages/contracts/contracts/randomness/CommitRevealRandomnessProvider.sol`: testnet commit-reveal provider with operator-controlled reveals.
- `packages/contracts/contracts/PackSale.sol`: native-token pack purchase and reveal flow that mints anchored inventory-backed items.
- `packages/contracts/contracts/Marketplace.sol`: fixed-price ERC-1155 escrow marketplace with protocol fees.
- `packages/contracts/contracts/BuybackVault.sol`: quote-based protocol buyback vault funded with native testnet ETH.
- `packages/contracts/contracts/Forge.sol`: recipe-based crafting with burn inputs, mint outputs, fees, caps, pausing, and grail protection.
- `packages/contracts/contracts/RedemptionRegistry.sol`: redemption request and admin fulfillment lifecycle.
- `packages/contracts/test/helpers/deploy.ts`: reusable fixture deployment and role wiring.
- `packages/contracts/test/InventoryRegistry.test.ts`: registry anchoring and access tests.
- `packages/contracts/test/ItemToken.test.ts`: ERC-1155 mint, burn, URI, and supply tests.
- `packages/contracts/test/RandomnessProvider.test.ts`: request, commit, reveal, and read tests.
- `packages/contracts/test/PackSale.test.ts`: drop purchase and reveal tests.
- `packages/contracts/test/Marketplace.test.ts`: list, cancel, buy, and fee tests.
- `packages/contracts/test/BuybackVault.test.ts`: quote, funding, and accept tests.
- `packages/contracts/test/Forge.test.ts`: recipe status, caps, fee, burn, mint, pause, and grail-protection tests.
- `packages/contracts/test/RedemptionRegistry.test.ts`: redemption escrow, status, cancel, and completion tests.
- `packages/contracts/scripts/deploy.ts`: deploys all contracts and writes a deployment registry.
- `packages/contracts/scripts/seed.ts`: anchors sample inventory and seeds one test drop and one Forge recipe.
- `packages/contracts/scripts/smoke.ts`: reads deployments and performs non-mutating checks.
- `deployments/.gitkeep`: keeps the deployment registry directory in git.

## Contract Decisions

- Use ERC-1155 for both physical and game items in V1.
- Derive physical token IDs as `uint256(keccak256(abi.encodePacked("inventory:", inventoryId)))`.
- Game item token IDs are admin-defined and must not reuse an inventory-derived token ID.
- `InventoryRegistry` owns inventory truth anchoring, not full mutable custody state. Offchain services continue to use `packages/inventory` for lifecycle labels.
- `PackSale` can only reveal inventory that is already anchored in `InventoryRegistry`.
- `Marketplace`, `BuybackVault`, `Forge`, and `RedemptionRegistry` use ERC-1155 approval and escrow/burn semantics.
- `Forge` V1 enforces exact token ID and amount recipes onchain. Tag, brand, set, and category matching are simulated and curated offchain before recipes are activated.
- Grail protection is onchain through `InventoryRegistry.isGrailProtectedToken(tokenId)`.
- Manual-review recipes cannot be self-service crafted; they emit no craft and revert with `ManualReviewRequired`.
- Redemption completion burns the escrowed token so redeemed physical items cannot be resold onchain.

## Task 1: Contracts Package Baseline

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/hardhat.config.ts`
- Create: `packages/contracts/contracts/InventoryRegistry.sol`
- Create: `packages/contracts/test/InventoryRegistry.test.ts`
- Create: `packages/contracts/test/helpers/deploy.ts`
- Create: `deployments/.gitkeep`

- [ ] **Step 1: Add the package scaffolding**

Create a Hardhat package with these scripts:

```json
{
  "scripts": {
    "build": "hardhat compile",
    "clean": "hardhat clean",
    "test": "hardhat test",
    "typecheck": "tsc --noEmit",
    "deploy:testnet": "hardhat run scripts/deploy.ts --network robinhoodTestnet",
    "deploy:mainnet": "hardhat run scripts/deploy.ts --network robinhoodMainnet",
    "seed:testnet": "hardhat run scripts/seed.ts --network robinhoodTestnet",
    "smoke:testnet": "hardhat run scripts/smoke.ts --network robinhoodTestnet"
  }
}
```

- [ ] **Step 2: Configure Hardhat networks**

Use Solidity `0.8.28`, optimizer enabled with `200` runs, and env vars:

```ts
const ROBINHOOD_TESTNET_RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const ROBINHOOD_MAINNET_RPC_URL =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
```

Networks must use chain IDs `46630` and `4663`.

- [ ] **Step 3: Write failing registry tests**

Cover these test names before implementing logic:

```ts
it("derives stable physical token ids from inventory ids", async () => {});
it("anchors an inventory hash once", async () => {});
it("rejects duplicate inventory anchors", async () => {});
it("restricts anchoring to the inventory admin role", async () => {});
it("marks anchored inventory as tokenized through the tokenizer role", async () => {});
it("exposes grail protection by physical token id", async () => {});
```

Run:

```bash
pnpm --filter @gacha/contracts test -- test/InventoryRegistry.test.ts
```

Expected: fails because `InventoryRegistry` behavior is absent.

- [ ] **Step 4: Implement `InventoryRegistry`**

Implement:

```solidity
function derivePhysicalTokenId(string memory inventoryId) public pure returns (uint256);
function anchorInventory(
  string calldata inventoryId,
  bytes32 inventoryHash,
  string calldata metadataUri,
  bool redeemable,
  bool grailProtected
) external onlyRole(INVENTORY_ADMIN_ROLE);
function markTokenized(string calldata inventoryId, address owner) external onlyRole(TOKENIZER_ROLE);
function getInventory(string calldata inventoryId) external view returns (InventoryRecord memory);
function isGrailProtectedToken(uint256 tokenId) external view returns (bool);
```

Emit `InventoryAnchored` and `InventoryTokenized`. Use custom errors for empty IDs, zero hashes, duplicates, missing records, and already-tokenized records.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/InventoryRegistry.test.ts
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add deployments/.gitkeep packages/contracts
git commit -m "feat: add protocol package baseline"
```

## Task 2: ERC-1155 Item Token

**Files:**

- Create: `packages/contracts/contracts/ItemToken.sol`
- Create: `packages/contracts/test/ItemToken.test.ts`
- Modify: `packages/contracts/test/helpers/deploy.ts`

- [ ] **Step 1: Write failing item token tests**

Cover:

```ts
it("mints a one-of-one inventory-backed token", async () => {});
it("rejects minting the same inventory-backed token twice", async () => {});
it("mints fungible game items", async () => {});
it("lets the burner role burn user-approved items", async () => {});
it("stores token-specific URIs", async () => {});
it("pauses token transfers", async () => {});
```

Run:

```bash
pnpm --filter @gacha/contracts test -- test/ItemToken.test.ts
```

Expected: fails because `ItemToken` is absent.

- [ ] **Step 2: Implement `ItemToken`**

Use OpenZeppelin `ERC1155`, `ERC1155Supply`, `AccessControl`, and `Pausable`.

Required functions:

```solidity
function mintInventoryItem(address to, uint256 tokenId, string calldata inventoryId, string calldata tokenUri)
  external onlyRole(MINTER_ROLE);
function mintGameItem(address to, uint256 tokenId, uint256 amount, string calldata tokenUri)
  external onlyRole(MINTER_ROLE);
function burn(address from, uint256 tokenId, uint256 amount) external onlyRole(BURNER_ROLE);
function setTokenURI(uint256 tokenId, string calldata tokenUri) external onlyRole(URI_SETTER_ROLE);
```

Inventory-backed mints must require total supply zero and amount one. Game item mints must allow repeated mints with positive amounts. Transfers must stop while paused.

- [ ] **Step 3: Wire fixtures and verify Task 2**

The helper must deploy `InventoryRegistry` and `ItemToken`, then grant roles to test signers as needed.

Run:

```bash
pnpm --filter @gacha/contracts test -- test/InventoryRegistry.test.ts test/ItemToken.test.ts
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 4: Commit Task 2**

```bash
git add packages/contracts
git commit -m "feat: add item token contract"
```

## Task 3: Randomness Provider And Pack Sale

**Files:**

- Create: `packages/contracts/contracts/randomness/IRandomnessProvider.sol`
- Create: `packages/contracts/contracts/randomness/CommitRevealRandomnessProvider.sol`
- Create: `packages/contracts/contracts/PackSale.sol`
- Create: `packages/contracts/test/RandomnessProvider.test.ts`
- Create: `packages/contracts/test/PackSale.test.ts`
- Modify: `packages/contracts/test/helpers/deploy.ts`

- [ ] **Step 1: Write failing randomness tests**

Cover:

```ts
it("records randomness requests", async () => {});
it("requires a commit before reveal", async () => {});
it("rejects a seed that does not match the commitment", async () => {});
it("returns ready randomness after reveal", async () => {});
it("restricts commit and reveal to the revealer role", async () => {});
```

- [ ] **Step 2: Implement `IRandomnessProvider` and commit-reveal provider**

Use this interface:

```solidity
interface IRandomnessProvider {
  function requestRandomness(bytes32 requestId) external;
  function readRandomness(bytes32 requestId) external view returns (bool ready, uint256 randomness);
}
```

Provider functions:

```solidity
function commitRandomness(bytes32 requestId, bytes32 commitment) external onlyRole(REVEALER_ROLE);
function revealRandomness(bytes32 requestId, bytes32 seed) external onlyRole(REVEALER_ROLE);
```

Commitment formula: `keccak256(abi.encode(seed))`.

- [ ] **Step 3: Write failing pack sale tests**

Cover:

```ts
it("creates a drop with anchored inventory entries", async () => {});
it("rejects drop creation with unanchored inventory", async () => {});
it("sells a pack for the configured native price", async () => {});
it("rejects purchases outside the sale window", async () => {});
it("reveals a purchased pack after randomness is ready", async () => {});
it("mints the revealed inventory token to the buyer", async () => {});
it("removes revealed inventory from the drop pool", async () => {});
it("forwards pack payments to the treasury", async () => {});
```

- [ ] **Step 4: Implement `PackSale`**

Required functions:

```solidity
function createDrop(CreateDropParams calldata params) external onlyRole(DROP_ADMIN_ROLE) returns (uint256);
function purchase(uint256 dropId) external payable nonReentrant returns (uint256 purchaseId);
function reveal(uint256 purchaseId) external nonReentrant returns (uint256 tokenId);
function remainingInventory(uint256 dropId) external view returns (uint256);
```

`CreateDropParams` must include name, price, start time, end time, max supply, inventory IDs, and metadata URIs. `purchase` must require exact payment, sale window activity, unsold supply, and remaining inventory. `reveal` must require the purchaser, unrevealed purchase, ready randomness, mint the selected physical token, and mark inventory tokenized.

- [ ] **Step 5: Verify Task 3**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/RandomnessProvider.test.ts test/PackSale.test.ts
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/contracts
git commit -m "feat: add pack sale protocol"
```

## Task 4: Marketplace And Buyback Vault

**Files:**

- Create: `packages/contracts/contracts/Marketplace.sol`
- Create: `packages/contracts/contracts/BuybackVault.sol`
- Create: `packages/contracts/test/Marketplace.test.ts`
- Create: `packages/contracts/test/BuybackVault.test.ts`
- Modify: `packages/contracts/test/helpers/deploy.ts`

- [ ] **Step 1: Write failing marketplace tests**

Cover:

```ts
it("escrows listed ERC-1155 items", async () => {});
it("rejects listings with zero price or zero amount", async () => {});
it("lets the seller cancel an active listing", async () => {});
it("sells the full listing for the exact price", async () => {});
it("pays seller proceeds minus protocol fee", async () => {});
it("pays protocol fees to the treasury", async () => {});
it("rejects buys for inactive listings", async () => {});
```

- [ ] **Step 2: Implement `Marketplace`**

Required functions:

```solidity
function list(uint256 tokenId, uint256 amount, uint256 price) external nonReentrant returns (uint256 listingId);
function cancel(uint256 listingId) external nonReentrant;
function buy(uint256 listingId) external payable nonReentrant;
function setFeeBps(uint96 feeBps) external onlyRole(MARKET_ADMIN_ROLE);
function setTreasury(address treasury) external onlyRole(MARKET_ADMIN_ROLE);
```

Use `ERC1155Holder`. Store seller, token ID, amount, price, and status. Fee basis points must be capped at `1000`.

- [ ] **Step 3: Write failing buyback tests**

Cover:

```ts
it("lets an admin set an active token quote", async () => {});
it("rejects buyback without an active quote", async () => {});
it("transfers accepted tokens into the vault", async () => {});
it("pays the quoted native amount from vault balance", async () => {});
it("rejects buyback when the vault lacks funds", async () => {});
it("lets an admin withdraw protocol-held tokens", async () => {});
```

- [ ] **Step 4: Implement `BuybackVault`**

Required functions:

```solidity
function setQuote(uint256 tokenId, uint256 price, bool active) external onlyRole(BUYBACK_ADMIN_ROLE);
function acceptQuote(uint256 tokenId, uint256 amount) external nonReentrant;
function withdrawToken(address to, uint256 tokenId, uint256 amount) external onlyRole(BUYBACK_ADMIN_ROLE);
function withdrawNative(address payable to, uint256 amount) external onlyRole(BUYBACK_ADMIN_ROLE);
receive() external payable;
```

The vault must transfer tokens from the seller into escrow, pay `price * amount`, and emit `BuybackAccepted`.

- [ ] **Step 5: Verify Task 4**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/Marketplace.test.ts test/BuybackVault.test.ts
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add packages/contracts
git commit -m "feat: add marketplace and buyback contracts"
```

## Task 5: Forge Contract

**Files:**

- Create: `packages/contracts/contracts/Forge.sol`
- Create: `packages/contracts/test/Forge.test.ts`
- Modify: `packages/contracts/test/helpers/deploy.ts`

- [ ] **Step 1: Write failing Forge tests**

Cover:

```ts
it("creates an inactive recipe with exact token inputs", async () => {});
it("activates an admin-reviewed recipe", async () => {});
it("rejects crafts while paused", async () => {});
it("rejects crafts for inactive recipes", async () => {});
it("rejects self-service crafts for manual-review recipes", async () => {});
it("burns the configured input items", async () => {});
it("mints the configured output item", async () => {});
it("collects the recipe fee", async () => {});
it("enforces max total crafts", async () => {});
it("enforces max crafts per wallet", async () => {});
it("blocks grail-protected inputs when the recipe excludes grails", async () => {});
```

- [ ] **Step 2: Implement `Forge`**

Use this status enum:

```solidity
enum RecipeStatus {
  Draft,
  Simulated,
  AdminReviewed,
  Scheduled,
  Active,
  Paused,
  Retired
}
```

Required functions:

```solidity
function createRecipe(CreateRecipeParams calldata params) external onlyRole(RECIPE_ADMIN_ROLE) returns (uint256);
function setRecipeStatus(uint256 recipeId, RecipeStatus status) external onlyRole(RECIPE_ADMIN_ROLE);
function craft(uint256 recipeId) external payable nonReentrant returns (uint256 outputTokenId);
function pause() external onlyRole(RECIPE_ADMIN_ROLE);
function unpause() external onlyRole(RECIPE_ADMIN_ROLE);
```

`CreateRecipeParams` must include input token IDs, input amounts, output token ID, output amount, output URI, fee, start time, end time, max total crafts, max crafts per wallet, requires manual review, and exclude grail protected inputs. `craft` must require active status, sale window, exact fee, caps, no manual-review flag, and grail checks. It burns inputs through `ItemToken.BURNER_ROLE` and mints output through `ItemToken.MINTER_ROLE`.

- [ ] **Step 3: Verify Task 5**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/Forge.test.ts
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 4: Commit Task 5**

```bash
git add packages/contracts
git commit -m "feat: add forge protocol"
```

## Task 6: Redemption Registry

**Files:**

- Create: `packages/contracts/contracts/RedemptionRegistry.sol`
- Create: `packages/contracts/test/RedemptionRegistry.test.ts`
- Modify: `packages/contracts/test/helpers/deploy.ts`

- [ ] **Step 1: Write failing redemption tests**

Cover:

```ts
it("escrows a user-owned redeemable token on request", async () => {});
it("rejects redemption for non-redeemable inventory", async () => {});
it("tracks requested, approved, packed, shipped, completed, and cancelled statuses", async () => {});
it("restricts fulfillment status changes to the redemption admin role", async () => {});
it("returns escrowed tokens when an admin cancels a request", async () => {});
it("burns escrowed tokens when an admin completes a request", async () => {});
```

- [ ] **Step 2: Implement `RedemptionRegistry`**

Use this status enum:

```solidity
enum RedemptionStatus {
  Requested,
  Approved,
  Packed,
  Shipped,
  Completed,
  Cancelled
}
```

Required functions:

```solidity
function requestRedemption(uint256 tokenId) external nonReentrant returns (uint256 requestId);
function approve(uint256 requestId) external onlyRole(REDEMPTION_ADMIN_ROLE);
function markPacked(uint256 requestId) external onlyRole(REDEMPTION_ADMIN_ROLE);
function markShipped(uint256 requestId, string calldata trackingRef) external onlyRole(REDEMPTION_ADMIN_ROLE);
function complete(uint256 requestId) external onlyRole(REDEMPTION_ADMIN_ROLE);
function cancel(uint256 requestId, string calldata reason) external onlyRole(REDEMPTION_ADMIN_ROLE);
```

Only one token can be redeemed per request. The contract must reject non-redeemable token IDs by checking `InventoryRegistry`. Completion must burn the escrowed token through `ItemToken.BURNER_ROLE`.

- [ ] **Step 3: Verify Task 6**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/RedemptionRegistry.test.ts
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 4: Commit Task 6**

```bash
git add packages/contracts
git commit -m "feat: add redemption protocol"
```

## Task 7: Deployment, Seed, And Smoke Scripts

**Files:**

- Create: `packages/contracts/scripts/deploy.ts`
- Create: `packages/contracts/scripts/seed.ts`
- Create: `packages/contracts/scripts/smoke.ts`
- Modify: `packages/contracts/package.json`

- [ ] **Step 1: Write deployment script**

Deploy in this order:

```text
InventoryRegistry
ItemToken
CommitRevealRandomnessProvider
PackSale
Marketplace
BuybackVault
Forge
RedemptionRegistry
```

Grant roles:

- `ItemToken.MINTER_ROLE` to `PackSale` and `Forge`.
- `ItemToken.BURNER_ROLE` to `Forge` and `RedemptionRegistry`.
- `InventoryRegistry.TOKENIZER_ROLE` to `PackSale`.
- Admin roles remain with the deployer for testnet operations.

Write `deployments/<network>.json` with chain ID, deployer, timestamp, and contract addresses.

- [ ] **Step 2: Write seed script**

Use `packages/inventory/src/sample-inventory.ts` to anchor sample inventory on the active network. Seed one drop with the sample drop-ready inventory item and one Forge recipe that burns two game items into one output game item.

- [ ] **Step 3: Write smoke script**

Read `deployments/<network>.json`, connect to each address, and verify:

```ts
await inventoryRegistry.DEFAULT_ADMIN_ROLE();
await itemToken.DEFAULT_ADMIN_ROLE();
await marketplace.feeBps();
await forge.paused();
```

The script must exit nonzero if any deployed address has no bytecode.

- [ ] **Step 4: Verify Task 7**

Run:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit Task 7**

```bash
git add deployments packages/contracts
git commit -m "feat: add protocol deployment scripts"
```

## Task 8: Final Protocol Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/testnet-runbook.md`
- Modify: `docs/mainnet-migration-runbook.md`

- [ ] **Step 1: Document local protocol commands**

Add commands for install, compile, test, deploy, seed, and smoke. Include required env vars:

```text
DEPLOYER_PRIVATE_KEY
ROBINHOOD_TESTNET_RPC_URL
ROBINHOOD_MAINNET_RPC_URL
```

- [ ] **Step 2: Document mainnet migration controls**

Document that mainnet deployment requires legal review, inventory freeze, deployment registry review, admin role review, RPC override, and a private smoke run before public launch.

- [ ] **Step 3: Run final verification**

Run:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
pnpm --filter @gacha/contracts typecheck
pnpm -r typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Commit Task 8**

```bash
git add README.md docs packages/contracts deployments
git commit -m "docs: add protocol runbooks"
```

## Final Acceptance

Phase 2 is complete when:

- `InventoryRegistry` anchors inventory hashes and tokenization records.
- `ItemToken` mints one-of-one physical inventory tokens and fungible game items.
- `PackSale` purchases and reveals anchored inventory-backed tokens.
- `Marketplace` supports fixed-price escrow listings with protocol fees.
- `BuybackVault` accepts quoted user tokens and pays from vault funds.
- `Forge` enforces recipe fees, burn/mint behavior, caps, pause state, manual-review blocking, and grail protection.
- `RedemptionRegistry` escrows redemption requests and burns completed redeemed tokens.
- Deployment, seed, and smoke scripts work against configured networks.
- Contracts build, tests pass, TypeScript typechecks, and `git diff --check` passes.
