# Robinhood Chain Gacha Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public testnet production-ready Robinhood Chain gacha vault dApp with contracts, metadata, deployment tooling, event cache, and a premium Next.js frontend.

**Architecture:** Use a TypeScript pnpm monorepo with `apps/web`, `packages/contracts`, `packages/metadata`, `packages/indexer`, and `packages/shared`. Contracts own token, pack, market, buyback, crafting, redemption, and randomness state; metadata owns deterministic fictional cards and generated assets; the web app reads contracts plus indexed events for a complete testnet experience.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js App Router, Tailwind CSS, wagmi, viem, RainbowKit, Hardhat, Solidity 0.8.28, OpenZeppelin Contracts, Vitest, Playwright, tsx, ESLint, Prettier.

---

## File Structure

Create this structure:

- `package.json`: root scripts for lint, test, typecheck, build, contracts, metadata, indexer, and web.
- `pnpm-workspace.yaml`: workspace package list.
- `tsconfig.base.json`: shared TypeScript settings.
- `.env.example`: local and Robinhood Chain testnet variables.
- `README.md`: local setup, testnet deploy, verification, seed, indexer, and smoke-test commands.
- `packages/shared`: chain config, deployment registry types, formatting helpers, rarity constants, and shared schemas.
- `packages/metadata`: Genesis Graders card data, pack tables, recipes, buyback tables, deterministic SVG generation, and metadata export.
- `packages/contracts`: Hardhat config, Solidity contracts, tests, deploy scripts, seed scripts, verification scripts, and smoke scripts.
- `packages/indexer`: event cache CLI and query helpers.
- `apps/web`: Next.js dApp, app shell, wallet provider, contract clients, indexer client, screens, components, and browser tests.

Commit after every task.

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Write the scaffold files**

Create `package.json`:

```json
{
  "name": "robinhood-chain-gacha-vault",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write .",
    "contracts": "pnpm --filter @gacha/contracts",
    "metadata": "pnpm --filter @gacha/metadata",
    "indexer": "pnpm --filter @gacha/indexer",
    "web": "pnpm --filter @gacha/web"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

Create `.env.example`:

```bash
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
ROBINHOOD_TESTNET_CHAIN_ID=46630
ROBINHOOD_TESTNET_PRIVATE_KEY=
ROBINHOOD_TESTNET_BLOCKSCOUT_API_URL=https://explorer.testnet.chain.robinhood.com/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_INDEXER_URL=http://localhost:4311
NEXT_PUBLIC_ENABLE_TESTNET_ADMIN=false
```

Create `README.md`:

```markdown
# Robinhood Chain Gacha Vault

Public testnet production-ready gacha collectibles dApp for Robinhood Chain testnet.

## Quick Start

```bash
pnpm install
pnpm metadata build
pnpm contracts test
pnpm web dev
```

## Robinhood Chain Testnet

- Chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Gas token: ETH

Copy `.env.example` to `.env` and set `ROBINHOOD_TESTNET_PRIVATE_KEY` before deploying.

## Core Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts deploy:testnet
pnpm contracts verify:testnet
pnpm contracts smoke:testnet
pnpm indexer start --network robinhoodTestnet
```

## Safety

The first release uses fictional card IP and models physical redemption on testnet. It does not represent real vaulted assets, production randomness, or mainnet financial value.
```

Append these lines to `.gitignore`:

```gitignore
.turbo/
*.tsbuildinfo
deployments/
packages/metadata/generated/
apps/web/.next/
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
pnpm install
```

Expected: lockfile is created and install exits with code `0`.

- [ ] **Step 3: Verify the root workspace**

Run:

```bash
pnpm -r exec node --version
```

Expected: command exits with code `0`; no package scripts are required yet.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example README.md .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold monorepo workspace"
```

---

### Task 2: Shared Types And Robinhood Chain Config

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/chains.ts`
- Create: `packages/shared/src/rarity.ts`
- Create: `packages/shared/src/format.ts`
- Create: `packages/shared/src/deployments.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/__tests__/chains.test.ts`
- Create: `packages/shared/src/__tests__/format.test.ts`

- [ ] **Step 1: Create package config**

Create `packages/shared/package.json`:

```json
{
  "name": "@gacha/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "viem": "^2.21.55",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing chain config test**

Create `packages/shared/src/__tests__/chains.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { robinhoodTestnet } from "../chains";

describe("robinhoodTestnet", () => {
  it("matches the public Robinhood Chain testnet config", () => {
    expect(robinhoodTestnet.id).toBe(46630);
    expect(robinhoodTestnet.nativeCurrency.symbol).toBe("ETH");
    expect(robinhoodTestnet.rpcUrls.default.http).toEqual([
      "https://rpc.testnet.chain.robinhood.com",
    ]);
  });
});
```

- [ ] **Step 3: Run the failing chain config test**

Run:

```bash
pnpm --filter @gacha/shared test -- src/__tests__/chains.test.ts
```

Expected: FAIL because `../chains` does not exist.

- [ ] **Step 4: Implement chain config**

Create `packages/shared/src/chains.ts`:

```ts
import type { Chain } from "viem";

export const robinhoodTestnet = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api",
    },
  },
  testnet: true,
} as const satisfies Chain;
```

- [ ] **Step 5: Run chain config test**

Run:

```bash
pnpm --filter @gacha/shared test -- src/__tests__/chains.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing formatting test**

Create `packages/shared/src/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBasisPoints, formatEthValue } from "../format";

describe("format helpers", () => {
  it("formats odds basis points as percentages", () => {
    expect(formatBasisPoints(50)).toBe("0.50%");
    expect(formatBasisPoints(2500)).toBe("25.00%");
  });

  it("formats wei values with compact ETH units", () => {
    expect(formatEthValue(1_500_000_000_000_000_000n)).toBe("1.5 ETH");
    expect(formatEthValue(25_000_000_000_000_000n)).toBe("0.025 ETH");
  });
});
```

- [ ] **Step 7: Run the failing formatting test**

Run:

```bash
pnpm --filter @gacha/shared test -- src/__tests__/format.test.ts
```

Expected: FAIL because `../format` does not exist.

- [ ] **Step 8: Implement shared rarity, formatting, deployments, and exports**

Create `packages/shared/src/rarity.ts`:

```ts
export const rarityOrder = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type Rarity = (typeof rarityOrder)[number];

export const rarityLabels: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};
```

Create `packages/shared/src/format.ts`:

```ts
import { formatEther } from "viem";

export function formatBasisPoints(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

export function formatEthValue(value: bigint): string {
  const formatted = formatEther(value);
  const trimmed = Number(formatted).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
  return `${trimmed} ETH`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
```

Create `packages/shared/src/deployments.ts`:

```ts
import { z } from "zod";

export const deploymentRegistrySchema = z.object({
  chainId: z.number(),
  network: z.string(),
  deployer: z.string(),
  deployedAt: z.string(),
  contracts: z.record(
    z.object({
      address: z.string(),
      transactionHash: z.string(),
      blockNumber: z.number(),
      explorerUrl: z.string(),
    }),
  ),
});

export type DeploymentRegistry = z.infer<typeof deploymentRegistrySchema>;
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./chains";
export * from "./deployments";
export * from "./format";
export * from "./rarity";
```

- [ ] **Step 9: Run shared tests and build**

Run:

```bash
pnpm --filter @gacha/shared test
pnpm --filter @gacha/shared build
```

Expected: PASS and `packages/shared/dist/index.d.ts` exists.

- [ ] **Step 10: Commit**

```bash
git add packages/shared package.json pnpm-lock.yaml
git commit -m "feat: add shared chain config and formatting"
```

---

### Task 3: Metadata Package And Genesis Graders Data

**Files:**
- Create: `packages/metadata/package.json`
- Create: `packages/metadata/tsconfig.json`
- Create: `packages/metadata/src/schema.ts`
- Create: `packages/metadata/src/genesis-graders.ts`
- Create: `packages/metadata/src/pack-tables.ts`
- Create: `packages/metadata/src/recipes.ts`
- Create: `packages/metadata/src/buyback.ts`
- Create: `packages/metadata/src/build.ts`
- Create: `packages/metadata/src/index.ts`
- Create: `packages/metadata/src/__tests__/genesis-graders.test.ts`

- [ ] **Step 1: Create metadata package config**

Create `packages/metadata/package.json`:

```json
{
  "name": "@gacha/metadata",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsx src/build.ts",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gacha/shared": "workspace:*",
    "tsx": "^4.19.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

Create `packages/metadata/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing Genesis Graders test**

Create `packages/metadata/src/__tests__/genesis-graders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buybackQuotes } from "../buyback";
import { genesisGradersCards } from "../genesis-graders";
import { standardPackTable } from "../pack-tables";
import { tradeUpRecipes } from "../recipes";

describe("Genesis Graders metadata", () => {
  it("defines 120 unique fictional cards", () => {
    expect(genesisGradersCards).toHaveLength(120);
    expect(new Set(genesisGradersCards.map((card) => card.tokenId)).size).toBe(120);
    expect(genesisGradersCards.every((card) => card.set === "Genesis Graders")).toBe(true);
  });

  it("uses only fictional names and cert ids", () => {
    expect(genesisGradersCards[0]).toMatchObject({
      name: "Aether Lynx",
      certId: "GG-000001",
      custodianLabel: "Atlas Vault Testnet Bay A",
    });
    expect(genesisGradersCards.some((card) => /Charizard|Jordan|Pokemon|Topps/i.test(card.name))).toBe(false);
  });

  it("defines pack odds in exactly 10000 basis points", () => {
    const total = standardPackTable.entries.reduce((sum, entry) => sum + entry.oddsBps, 0);
    expect(total).toBe(10000);
  });

  it("defines buyback quotes and trade-up recipes", () => {
    expect(Object.keys(buybackQuotes).length).toBe(120);
    expect(tradeUpRecipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipeId: 1, outputPackTokenId: 9001 }),
      ]),
    );
  });
});
```

- [ ] **Step 3: Run the failing metadata test**

Run:

```bash
pnpm --filter @gacha/metadata test -- src/__tests__/genesis-graders.test.ts
```

Expected: FAIL because metadata source files do not exist.

- [ ] **Step 4: Implement schemas**

Create `packages/metadata/src/schema.ts`:

```ts
import { z } from "zod";
import { rarityOrder } from "@gacha/shared";

export const raritySchema = z.enum(rarityOrder);

export const cardSchema = z.object({
  tokenId: z.number().int().positive(),
  name: z.string().min(3),
  set: z.literal("Genesis Graders"),
  rarity: raritySchema,
  grade: z.enum(["8", "8.5", "9", "9.5", "10"]),
  certId: z.string().regex(/^GG-\d{6}$/),
  populationCount: z.number().int().positive(),
  conditionNotes: z.string().min(10),
  vaultStatus: z.enum(["vaulted", "pending_redemption", "redeemed"]),
  custodianLabel: z.string().min(8),
  redemptionEligible: z.boolean(),
  imageUri: z.string(),
  animationUri: z.string(),
});

export type CardDefinition = z.infer<typeof cardSchema>;

export const packTableEntrySchema = z.object({
  rarity: raritySchema,
  oddsBps: z.number().int().positive(),
});

export const packTableSchema = z.object({
  packTokenId: z.number().int().positive(),
  name: z.string(),
  entries: z.array(packTableEntrySchema).min(1),
});

export type PackTable = z.infer<typeof packTableSchema>;

export const recipeSchema = z.object({
  recipeId: z.number().int().positive(),
  inputRarity: raritySchema,
  inputCount: z.number().int().positive(),
  outputPackTokenId: z.number().int().positive(),
});

export type TradeUpRecipe = z.infer<typeof recipeSchema>;
```

- [ ] **Step 5: Implement deterministic cards**

Create `packages/metadata/src/genesis-graders.ts`:

```ts
import type { CardDefinition } from "./schema";

const names = [
  "Aether Lynx",
  "Solar Broker",
  "Index Warden",
  "Neon Custodian",
  "Circuit Baron",
  "Delta Oracle",
  "Midnight Ticker",
  "Vault Runner",
  "Signal Regent",
  "Quantum Floor",
  "Ledger Phantom",
  "Emerald Arbiter",
] as const;

const rarityByIndex = (index: number): CardDefinition["rarity"] => {
  if (index >= 118) return "mythic";
  if (index >= 112) return "legendary";
  if (index >= 96) return "epic";
  if (index >= 66) return "rare";
  if (index >= 30) return "uncommon";
  return "common";
};

const gradeByIndex = (index: number): CardDefinition["grade"] => {
  const grades: CardDefinition["grade"][] = ["8", "8.5", "9", "9.5", "10"];
  return grades[index % grades.length] ?? "9";
};

export const genesisGradersCards: CardDefinition[] = Array.from({ length: 120 }, (_, index) => {
  const tokenId = index + 1;
  const rarity = rarityByIndex(index);
  const baseName = names[index % names.length] ?? "Vault Signal";
  const series = Math.floor(index / names.length) + 1;

  return {
    tokenId,
    name: tokenId === 1 ? "Aether Lynx" : `${baseName} ${series}`,
    set: "Genesis Graders",
    rarity,
    grade: gradeByIndex(index),
    certId: `GG-${String(tokenId).padStart(6, "0")}`,
    populationCount: Math.max(3, 420 - index * 3),
    conditionNotes: `${rarity.toUpperCase()} testnet slab with crisp edges, centered print, and fictional vault provenance.`,
    vaultStatus: "vaulted",
    custodianLabel: "Atlas Vault Testnet Bay A",
    redemptionEligible: rarity === "legendary" || rarity === "mythic",
    imageUri: `cards/${tokenId}.svg`,
    animationUri: "",
  };
});
```

- [ ] **Step 6: Implement pack tables, recipes, and buyback quotes**

Create `packages/metadata/src/pack-tables.ts`:

```ts
import type { PackTable } from "./schema";

export const STANDARD_PACK_TOKEN_ID = 9000;
export const TRADE_UP_PACK_TOKEN_ID = 9001;

export const standardPackTable: PackTable = {
  packTokenId: STANDARD_PACK_TOKEN_ID,
  name: "Genesis Graders Standard Pack",
  entries: [
    { rarity: "common", oddsBps: 5200 },
    { rarity: "uncommon", oddsBps: 2600 },
    { rarity: "rare", oddsBps: 1400 },
    { rarity: "epic", oddsBps: 600 },
    { rarity: "legendary", oddsBps: 180 },
    { rarity: "mythic", oddsBps: 20 },
  ],
};
```

Create `packages/metadata/src/recipes.ts`:

```ts
import type { TradeUpRecipe } from "./schema";
import { TRADE_UP_PACK_TOKEN_ID } from "./pack-tables";

export const tradeUpRecipes: TradeUpRecipe[] = [
  { recipeId: 1, inputRarity: "common", inputCount: 5, outputPackTokenId: TRADE_UP_PACK_TOKEN_ID },
  { recipeId: 2, inputRarity: "uncommon", inputCount: 4, outputPackTokenId: TRADE_UP_PACK_TOKEN_ID },
  { recipeId: 3, inputRarity: "rare", inputCount: 3, outputPackTokenId: TRADE_UP_PACK_TOKEN_ID },
];
```

Create `packages/metadata/src/buyback.ts`:

```ts
import { parseEther } from "viem";
import { genesisGradersCards } from "./genesis-graders";

const quoteByRarity = {
  common: parseEther("0.001"),
  uncommon: parseEther("0.0025"),
  rare: parseEther("0.006"),
  epic: parseEther("0.015"),
  legendary: parseEther("0.05"),
  mythic: parseEther("0.15"),
} as const;

export const buybackQuotes = Object.fromEntries(
  genesisGradersCards.map((card) => [card.tokenId, quoteByRarity[card.rarity].toString()]),
);
```

- [ ] **Step 7: Implement package exports**

Create `packages/metadata/src/index.ts`:

```ts
export * from "./buyback";
export * from "./genesis-graders";
export * from "./pack-tables";
export * from "./recipes";
export * from "./schema";
```

- [ ] **Step 8: Implement asset and metadata builder**

Create `packages/metadata/src/build.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { genesisGradersCards } from "./genesis-graders";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../generated");
const cardsDir = path.join(outputDir, "cards");
const metadataDir = path.join(outputDir, "metadata");

function svgForCard(card: (typeof genesisGradersCards)[number]): string {
  const accent = {
    common: "#cfd8d2",
    uncommon: "#00c805",
    rare: "#55a7ff",
    epic: "#a56eff",
    legendary: "#f3c94d",
    mythic: "#ff5fa2",
  }[card.rarity];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 744 1038">
  <rect width="744" height="1038" rx="36" fill="#0f1513"/>
  <rect x="36" y="36" width="672" height="966" rx="28" fill="#f5f7f2"/>
  <rect x="72" y="92" width="600" height="520" rx="24" fill="#111a16"/>
  <path d="M96 560 L648 128" stroke="${accent}" stroke-width="18" opacity="0.72"/>
  <circle cx="372" cy="348" r="132" fill="${accent}" opacity="0.22"/>
  <text x="92" y="710" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="#101713">${card.name}</text>
  <text x="92" y="772" font-family="Arial, sans-serif" font-size="28" fill="#314139">${card.set}</text>
  <text x="92" y="842" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#101713">Grade ${card.grade} • ${card.rarity.toUpperCase()}</text>
  <text x="92" y="898" font-family="Arial, sans-serif" font-size="24" fill="#56645c">${card.certId} • Pop ${card.populationCount}</text>
</svg>`;
}

async function main() {
  await mkdir(cardsDir, { recursive: true });
  await mkdir(metadataDir, { recursive: true });

  for (const card of genesisGradersCards) {
    await writeFile(path.join(cardsDir, `${card.tokenId}.svg`), svgForCard(card));
    await writeFile(
      path.join(metadataDir, `${card.tokenId}.json`),
      JSON.stringify(
        {
          name: card.name,
          description: `${card.name} is a fictional Genesis Graders testnet collectible with modeled vault provenance.`,
          image: card.imageUri,
          animation_url: card.animationUri,
          attributes: [
            { trait_type: "Set", value: card.set },
            { trait_type: "Rarity", value: card.rarity },
            { trait_type: "Grade", value: card.grade },
            { trait_type: "Cert ID", value: card.certId },
            { trait_type: "Population", value: card.populationCount },
            { trait_type: "Vault Status", value: card.vaultStatus },
            { trait_type: "Custodian", value: card.custodianLabel },
            { trait_type: "Redeemable", value: card.redemptionEligible ? "Yes" : "No" },
          ],
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 9: Run metadata tests and build**

Run:

```bash
pnpm --filter @gacha/metadata test
pnpm --filter @gacha/metadata build
```

Expected: PASS, and `packages/metadata/generated/metadata/1.json` plus `packages/metadata/generated/cards/1.svg` exist.

- [ ] **Step 10: Commit**

```bash
git add packages/metadata package.json pnpm-lock.yaml
git commit -m "feat: add Genesis Graders metadata"
```

---

### Task 4: Contracts Package Scaffold And CardToken

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/hardhat.config.ts`
- Create: `packages/contracts/contracts/CardToken.sol`
- Create: `packages/contracts/test/CardToken.test.ts`

- [ ] **Step 1: Create contracts package config**

Create `packages/contracts/package.json`:

```json
{
  "name": "@gacha/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "hardhat compile",
    "lint": "hardhat compile",
    "test": "hardhat test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "deploy:local": "hardhat run scripts/deploy.ts --network localhost",
    "deploy:testnet": "hardhat run scripts/deploy.ts --network robinhoodTestnet",
    "seed:local": "hardhat run scripts/seed.ts --network localhost",
    "seed:testnet": "hardhat run scripts/seed.ts --network robinhoodTestnet",
    "verify:testnet": "hardhat run scripts/verify.ts --network robinhoodTestnet",
    "smoke:testnet": "hardhat run scripts/smoke.ts --network robinhoodTestnet"
  },
  "dependencies": {
    "@gacha/metadata": "workspace:*",
    "@gacha/shared": "workspace:*",
    "@nomicfoundation/hardhat-ethers": "^3.0.8",
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "@openzeppelin/contracts": "^5.2.0",
    "dotenv": "^16.4.7",
    "hardhat": "^2.22.18",
    "tsx": "^4.19.2"
  },
  "devDependencies": {
    "@types/chai": "^5.0.1",
    "@types/mocha": "^10.0.10",
    "typescript": "^5.7.2"
  }
}
```

Create `packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node", "mocha"]
  },
  "include": ["hardhat.config.ts", "scripts", "test"]
}
```

Create `packages/contracts/hardhat.config.ts`:

```ts
import { config as loadEnv } from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

loadEnv({ path: "../../.env" });

const privateKey = process.env.ROBINHOOD_TESTNET_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      robinhoodTestnet: "empty",
    },
    customChains: [
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL:
            process.env.ROBINHOOD_TESTNET_BLOCKSCOUT_API_URL ??
            "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
    ],
  },
};

export default config;
```

- [ ] **Step 2: Write failing CardToken test**

Create `packages/contracts/test/CardToken.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("CardToken", () => {
  it("allows a minter to mint and a burner to burn ERC-1155 cards", async () => {
    const [owner, minter, burner, collector] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");

    await token.grantRole(await token.MINTER_ROLE(), minter.address);
    await token.grantRole(await token.BURNER_ROLE(), burner.address);

    await token.connect(minter).mint(collector.address, 1, 2, "0x");
    expect(await token.balanceOf(collector.address, 1)).to.equal(2n);

    await token.connect(burner).burn(collector.address, 1, 1);
    expect(await token.balanceOf(collector.address, 1)).to.equal(1n);
  });

  it("rejects unauthorized minting", async () => {
    const [owner, attacker, collector] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");

    await expect(token.connect(attacker).mint(collector.address, 1, 1, "0x")).to.be.reverted;
  });
});
```

- [ ] **Step 3: Run the failing CardToken test**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/CardToken.test.ts
```

Expected: FAIL because `CardToken` does not exist.

- [ ] **Step 4: Implement CardToken**

Create `packages/contracts/contracts/CardToken.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract CardToken is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant URI_MANAGER_ROLE = keccak256("URI_MANAGER_ROLE");

    constructor(address admin, string memory baseUri) ERC1155(baseUri) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(URI_MANAGER_ROLE, admin);
    }

    function setURI(string memory newUri) external onlyRole(URI_MANAGER_ROLE) {
        _setURI(newUri);
    }

    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
    }

    function burn(address from, uint256 id, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, id, amount);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 5: Run CardToken tests**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/CardToken.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts package.json pnpm-lock.yaml
git commit -m "feat: add ERC1155 card token"
```

---

### Task 5: Randomness Provider And PackSale

**Files:**
- Create: `packages/contracts/contracts/randomness/IRandomnessProvider.sol`
- Create: `packages/contracts/contracts/randomness/MockRandomnessProvider.sol`
- Create: `packages/contracts/contracts/randomness/CommitRevealRandomnessProvider.sol`
- Create: `packages/contracts/contracts/PackSale.sol`
- Create: `packages/contracts/test/PackSale.test.ts`

- [ ] **Step 1: Write failing PackSale test**

Create `packages/contracts/test/PackSale.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("PackSale", () => {
  async function deployFixture() {
    const [owner, buyer] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");

    const Randomness = await ethers.getContractFactory("MockRandomnessProvider");
    const randomness = await Randomness.deploy(owner.address);

    const PackSale = await ethers.getContractFactory("PackSale");
    const sale = await PackSale.deploy(
      owner.address,
      await token.getAddress(),
      await randomness.getAddress(),
      ethers.parseEther("0.01"),
      100,
    );

    await token.grantRole(await token.MINTER_ROLE(), await sale.getAddress());
    await randomness.grantRole(await randomness.CONSUMER_ROLE(), await sale.getAddress());
    await sale.configureRarityBucket(0, 1, 30);
    await sale.configureRarityBucket(1, 31, 66);
    await sale.configureRarityBucket(2, 67, 96);
    await sale.configureRarityBucket(3, 97, 112);
    await sale.configureRarityBucket(4, 113, 118);
    await sale.configureRarityBucket(5, 119, 120);

    return { owner, buyer, token, randomness, sale };
  }

  it("sells a pack, resolves randomness, and mints a revealed card", async () => {
    const { buyer, token, randomness, sale } = await deployFixture();

    const tx = await sale.connect(buyer).buyPack({ value: ethers.parseEther("0.01") });
    const receipt = await tx.wait();
    const event = receipt?.logs
      .map((log) => {
        try {
          return sale.interface.parseLog(log);
        } catch {
          return undefined;
        }
      })
      .find((parsed) => parsed?.name === "PackPurchased");

    const requestId = event?.args.requestId as bigint;
    await randomness.fulfill(requestId, 119n);

    expect(await token.balanceOf(buyer.address, 120)).to.equal(1n);
    expect(await sale.sold()).to.equal(1n);
  });

  it("rejects underpayment", async () => {
    const { buyer, sale } = await deployFixture();
    await expect(sale.connect(buyer).buyPack({ value: ethers.parseEther("0.009") })).to.be.revertedWithCustomError(
      sale,
      "IncorrectPayment",
    );
  });
});
```

- [ ] **Step 2: Run the failing PackSale test**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/PackSale.test.ts
```

Expected: FAIL because randomness contracts and `PackSale` do not exist.

- [ ] **Step 3: Implement randomness interface and mock provider**

Create `packages/contracts/contracts/randomness/IRandomnessProvider.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IRandomnessConsumer {
    function receiveRandomness(uint256 requestId, uint256 randomWord) external;
}

interface IRandomnessProvider {
    function requestRandomness(address consumer) external returns (uint256 requestId);
}
```

Create `packages/contracts/contracts/randomness/MockRandomnessProvider.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRandomnessConsumer, IRandomnessProvider} from "./IRandomnessProvider.sol";

contract MockRandomnessProvider is AccessControl, IRandomnessProvider {
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    uint256 public nextRequestId = 1;
    mapping(uint256 requestId => address consumer) public consumers;

    event RandomnessRequested(uint256 indexed requestId, address indexed consumer);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomWord);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function requestRandomness(address consumer) external onlyRole(CONSUMER_ROLE) returns (uint256 requestId) {
        requestId = nextRequestId++;
        consumers[requestId] = consumer;
        emit RandomnessRequested(requestId, consumer);
    }

    function fulfill(uint256 requestId, uint256 randomWord) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address consumer = consumers[requestId];
        require(consumer != address(0), "unknown request");
        delete consumers[requestId];
        IRandomnessConsumer(consumer).receiveRandomness(requestId, randomWord);
        emit RandomnessFulfilled(requestId, randomWord);
    }
}
```

Create `packages/contracts/contracts/randomness/CommitRevealRandomnessProvider.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRandomnessConsumer, IRandomnessProvider} from "./IRandomnessProvider.sol";

contract CommitRevealRandomnessProvider is AccessControl, IRandomnessProvider {
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");
    bytes32 public constant REVEALER_ROLE = keccak256("REVEALER_ROLE");

    uint256 public nextRequestId = 1;
    bytes32 public seedCommitment;
    mapping(uint256 requestId => address consumer) public consumers;

    event SeedCommitted(bytes32 indexed commitment);
    event RandomnessRequested(uint256 indexed requestId, address indexed consumer);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomWord);

    constructor(address admin, bytes32 initialSeedCommitment) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVEALER_ROLE, admin);
        seedCommitment = initialSeedCommitment;
        emit SeedCommitted(initialSeedCommitment);
    }

    function commitSeed(bytes32 commitment) external onlyRole(REVEALER_ROLE) {
        seedCommitment = commitment;
        emit SeedCommitted(commitment);
    }

    function requestRandomness(address consumer) external onlyRole(CONSUMER_ROLE) returns (uint256 requestId) {
        requestId = nextRequestId++;
        consumers[requestId] = consumer;
        emit RandomnessRequested(requestId, consumer);
    }

    function reveal(uint256 requestId, bytes32 seed) external onlyRole(REVEALER_ROLE) {
        require(keccak256(abi.encode(seed)) == seedCommitment, "seed mismatch");
        address consumer = consumers[requestId];
        require(consumer != address(0), "unknown request");
        delete consumers[requestId];
        uint256 randomWord = uint256(keccak256(abi.encode(seed, requestId, block.prevrandao, blockhash(block.number - 1))));
        IRandomnessConsumer(consumer).receiveRandomness(requestId, randomWord);
        emit RandomnessFulfilled(requestId, randomWord);
    }
}
```

- [ ] **Step 4: Implement PackSale**

Create `packages/contracts/contracts/PackSale.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CardToken} from "./CardToken.sol";
import {IRandomnessConsumer, IRandomnessProvider} from "./randomness/IRandomnessProvider.sol";

contract PackSale is AccessControl, Pausable, ReentrancyGuard, IRandomnessConsumer {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    error IncorrectPayment();
    error SoldOut();
    error UnknownRequest();
    error UnauthorizedRandomness();
    error BucketNotConfigured();

    struct Purchase {
        address buyer;
        bool fulfilled;
    }

    struct RarityBucket {
        uint256 startTokenId;
        uint256 endTokenId;
        bool configured;
    }

    CardToken public immutable cardToken;
    IRandomnessProvider public randomnessProvider;
    uint256 public packPrice;
    uint256 public maxSupply;
    uint256 public sold;

    mapping(uint256 requestId => Purchase purchase) public purchases;
    mapping(uint8 rarity => RarityBucket bucket) public rarityBuckets;

    event PackPurchased(address indexed buyer, uint256 indexed requestId, uint256 price);
    event PackRevealed(address indexed buyer, uint256 indexed requestId, uint256 indexed tokenId, uint8 rarity);
    event RarityBucketConfigured(uint8 indexed rarity, uint256 startTokenId, uint256 endTokenId);

    constructor(address admin, address cardToken_, address randomnessProvider_, uint256 packPrice_, uint256 maxSupply_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        cardToken = CardToken(cardToken_);
        randomnessProvider = IRandomnessProvider(randomnessProvider_);
        packPrice = packPrice_;
        maxSupply = maxSupply_;
    }

    function configureRarityBucket(uint8 rarity, uint256 startTokenId, uint256 endTokenId) external onlyRole(OPERATOR_ROLE) {
        require(startTokenId <= endTokenId, "bad bucket");
        rarityBuckets[rarity] = RarityBucket(startTokenId, endTokenId, true);
        emit RarityBucketConfigured(rarity, startTokenId, endTokenId);
    }

    function buyPack() external payable whenNotPaused nonReentrant returns (uint256 requestId) {
        if (msg.value != packPrice) revert IncorrectPayment();
        if (sold >= maxSupply) revert SoldOut();
        sold += 1;
        requestId = randomnessProvider.requestRandomness(address(this));
        purchases[requestId] = Purchase(msg.sender, false);
        emit PackPurchased(msg.sender, requestId, msg.value);
    }

    function receiveRandomness(uint256 requestId, uint256 randomWord) external override {
        if (msg.sender != address(randomnessProvider)) revert UnauthorizedRandomness();
        Purchase storage purchase = purchases[requestId];
        if (purchase.buyer == address(0) || purchase.fulfilled) revert UnknownRequest();
        purchase.fulfilled = true;

        uint8 rarity = _rarityFromRandom(randomWord);
        RarityBucket memory bucket = rarityBuckets[rarity];
        if (!bucket.configured) revert BucketNotConfigured();
        uint256 span = bucket.endTokenId - bucket.startTokenId + 1;
        uint256 tokenId = bucket.startTokenId + (randomWord % span);
        cardToken.mint(purchase.buyer, tokenId, 1, "");
        emit PackRevealed(purchase.buyer, requestId, tokenId, rarity);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function _rarityFromRandom(uint256 randomWord) internal pure returns (uint8) {
        uint256 roll = randomWord % 10000;
        if (roll < 5200) return 0;
        if (roll < 7800) return 1;
        if (roll < 9200) return 2;
        if (roll < 9800) return 3;
        if (roll < 9980) return 4;
        return 5;
    }
}
```

- [ ] **Step 5: Run PackSale tests**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/PackSale.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/contracts packages/contracts/test package.json pnpm-lock.yaml
git commit -m "feat: add pack sale randomness flow"
```

---

### Task 6: Marketplace Contract

**Files:**
- Create: `packages/contracts/contracts/Marketplace.sol`
- Create: `packages/contracts/test/Marketplace.test.ts`

- [ ] **Step 1: Write failing Marketplace test**

Create `packages/contracts/test/Marketplace.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Marketplace", () => {
  async function deployFixture() {
    const [owner, seller, buyer, treasury] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");
    await token.grantRole(await token.MINTER_ROLE(), owner.address);
    await token.mint(seller.address, 1, 2, "0x");

    const Marketplace = await ethers.getContractFactory("Marketplace");
    const market = await Marketplace.deploy(owner.address, await token.getAddress(), treasury.address, 250);
    await token.connect(seller).setApprovalForAll(await market.getAddress(), true);
    return { seller, buyer, treasury, token, market };
  }

  it("lists and buys a partial ERC-1155 quantity", async () => {
    const { seller, buyer, treasury, token, market } = await deployFixture();
    await market.connect(seller).createListing(1, 2, ethers.parseEther("0.1"));

    await expect(() =>
      market.connect(buyer).buy(1, 1, { value: ethers.parseEther("0.1") }),
    ).to.changeEtherBalance(treasury, ethers.parseEther("0.0025"));

    expect(await token.balanceOf(buyer.address, 1)).to.equal(1n);
    const listing = await market.listings(1);
    expect(listing.quantityRemaining).to.equal(1n);
  });

  it("allows seller cancellation", async () => {
    const { seller, token, market } = await deployFixture();
    await market.connect(seller).createListing(1, 1, ethers.parseEther("0.1"));
    await market.connect(seller).cancelListing(1);
    expect(await token.balanceOf(seller.address, 1)).to.equal(2n);
  });
});
```

- [ ] **Step 2: Run failing Marketplace test**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/Marketplace.test.ts
```

Expected: FAIL because `Marketplace` does not exist.

- [ ] **Step 3: Implement Marketplace**

Create `packages/contracts/contracts/Marketplace.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CardToken} from "./CardToken.sol";

contract Marketplace is AccessControl, IERC1155Receiver, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    error InvalidQuantity();
    error IncorrectPayment();
    error NotSeller();
    error ListingInactive();

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 quantityRemaining;
        uint256 unitPrice;
        bool active;
    }

    CardToken public immutable cardToken;
    address public treasury;
    uint256 public feeBps;
    uint256 public nextListingId = 1;
    mapping(uint256 listingId => Listing listing) public listings;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 quantity, uint256 unitPrice);
    event ListingPurchased(uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 totalPrice);
    event ListingCancelled(uint256 indexed listingId);

    constructor(address admin, address cardToken_, address treasury_, uint256 feeBps_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        cardToken = CardToken(cardToken_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    function createListing(uint256 tokenId, uint256 quantity, uint256 unitPrice) external whenNotPaused nonReentrant returns (uint256 listingId) {
        if (quantity == 0 || unitPrice == 0) revert InvalidQuantity();
        listingId = nextListingId++;
        listings[listingId] = Listing(msg.sender, tokenId, quantity, unitPrice, true);
        cardToken.safeTransferFrom(msg.sender, address(this), tokenId, quantity, "");
        emit ListingCreated(listingId, msg.sender, tokenId, quantity, unitPrice);
    }

    function buy(uint256 listingId, uint256 quantity) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingInactive();
        if (quantity == 0 || quantity > listing.quantityRemaining) revert InvalidQuantity();
        uint256 totalPrice = listing.unitPrice * quantity;
        if (msg.value != totalPrice) revert IncorrectPayment();
        listing.quantityRemaining -= quantity;
        if (listing.quantityRemaining == 0) listing.active = false;
        uint256 fee = (totalPrice * feeBps) / 10000;
        payable(treasury).transfer(fee);
        payable(listing.seller).transfer(totalPrice - fee);
        cardToken.safeTransferFrom(address(this), msg.sender, listing.tokenId, quantity, "");
        emit ListingPurchased(listingId, msg.sender, quantity, totalPrice);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingInactive();
        if (listing.seller != msg.sender) revert NotSeller();
        listing.active = false;
        uint256 quantity = listing.quantityRemaining;
        listing.quantityRemaining = 0;
        cardToken.safeTransferFrom(address(this), listing.seller, listing.tokenId, quantity, "");
        emit ListingCancelled(listingId);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 4: Run Marketplace tests**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/Marketplace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/contracts/Marketplace.sol packages/contracts/test/Marketplace.test.ts
git commit -m "feat: add fixed price marketplace"
```

---

### Task 7: Buyback, Trade-Up, And Redemption Contracts

**Files:**
- Create: `packages/contracts/contracts/BuybackVault.sol`
- Create: `packages/contracts/contracts/TradeUpCrafting.sol`
- Create: `packages/contracts/contracts/RedemptionRegistry.sol`
- Create: `packages/contracts/test/BuybackVault.test.ts`
- Create: `packages/contracts/test/TradeUpCrafting.test.ts`
- Create: `packages/contracts/test/RedemptionRegistry.test.ts`

- [ ] **Step 1: Write failing BuybackVault test**

Create `packages/contracts/test/BuybackVault.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("BuybackVault", () => {
  it("pays a configured testnet quote and escrows the card", async () => {
    const [owner, collector] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");
    await token.grantRole(await token.MINTER_ROLE(), owner.address);
    await token.mint(collector.address, 1, 1, "0x");

    const BuybackVault = await ethers.getContractFactory("BuybackVault");
    const vault = await BuybackVault.deploy(owner.address, await token.getAddress());
    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await vault.setQuote(1, ethers.parseEther("0.01"));
    await token.connect(collector).setApprovalForAll(await vault.getAddress(), true);

    await expect(() => vault.connect(collector).acceptQuote(1, 1)).to.changeEtherBalance(
      collector,
      ethers.parseEther("0.01"),
    );
    expect(await token.balanceOf(await vault.getAddress(), 1)).to.equal(1n);
  });
});
```

- [ ] **Step 2: Write failing TradeUpCrafting test**

Create `packages/contracts/test/TradeUpCrafting.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TradeUpCrafting", () => {
  it("burns inputs and mints output pack", async () => {
    const [owner, collector] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");
    await token.grantRole(await token.MINTER_ROLE(), owner.address);
    await token.grantRole(await token.BURNER_ROLE(), owner.address);
    await token.mint(collector.address, 1, 5, "0x");

    const Crafting = await ethers.getContractFactory("TradeUpCrafting");
    const crafting = await Crafting.deploy(owner.address, await token.getAddress());
    await token.grantRole(await token.MINTER_ROLE(), await crafting.getAddress());
    await token.grantRole(await token.BURNER_ROLE(), await crafting.getAddress());
    await crafting.setRecipe(1, [1], [5], 9001, 1);
    await token.connect(collector).setApprovalForAll(await crafting.getAddress(), true);

    await crafting.connect(collector).craft(1);
    expect(await token.balanceOf(collector.address, 1)).to.equal(0n);
    expect(await token.balanceOf(collector.address, 9001)).to.equal(1n);
  });
});
```

- [ ] **Step 3: Write failing RedemptionRegistry test**

Create `packages/contracts/test/RedemptionRegistry.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("RedemptionRegistry", () => {
  it("escrows a redeemable card and tracks lifecycle status", async () => {
    const [owner, collector] = await ethers.getSigners();
    const CardToken = await ethers.getContractFactory("CardToken");
    const token = await CardToken.deploy(owner.address, "ipfs://base/");
    await token.grantRole(await token.MINTER_ROLE(), owner.address);
    await token.mint(collector.address, 119, 1, "0x");

    const Redemption = await ethers.getContractFactory("RedemptionRegistry");
    const registry = await Redemption.deploy(owner.address, await token.getAddress());
    await registry.setRedeemable(119, true);
    await token.connect(collector).setApprovalForAll(await registry.getAddress(), true);

    await registry.connect(collector).requestRedemption(119, "ipfs://redemption/119");
    expect(await token.balanceOf(await registry.getAddress(), 119)).to.equal(1n);
    expect((await registry.requests(1)).status).to.equal(1n);

    await registry.updateStatus(1, 2);
    expect((await registry.requests(1)).status).to.equal(2n);
  });
});
```

- [ ] **Step 4: Run failing tests**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/BuybackVault.test.ts test/TradeUpCrafting.test.ts test/RedemptionRegistry.test.ts
```

Expected: FAIL because the three contracts do not exist.

- [ ] **Step 5: Implement BuybackVault**

Create `packages/contracts/contracts/BuybackVault.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CardToken} from "./CardToken.sol";

contract BuybackVault is AccessControl, IERC1155Receiver, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    CardToken public immutable cardToken;
    mapping(uint256 tokenId => uint256 quote) public quotes;

    error QuoteUnavailable();
    error InsufficientVaultBalance();

    event QuoteSet(uint256 indexed tokenId, uint256 quote);
    event QuoteAccepted(address indexed collector, uint256 indexed tokenId, uint256 quantity, uint256 payout);

    constructor(address admin, address cardToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        cardToken = CardToken(cardToken_);
    }

    receive() external payable {}

    function setQuote(uint256 tokenId, uint256 quote) external onlyRole(OPERATOR_ROLE) {
        quotes[tokenId] = quote;
        emit QuoteSet(tokenId, quote);
    }

    function acceptQuote(uint256 tokenId, uint256 quantity) external whenNotPaused nonReentrant {
        uint256 quote = quotes[tokenId];
        if (quote == 0) revert QuoteUnavailable();
        uint256 payout = quote * quantity;
        if (address(this).balance < payout) revert InsufficientVaultBalance();
        cardToken.safeTransferFrom(msg.sender, address(this), tokenId, quantity, "");
        payable(msg.sender).transfer(payout);
        emit QuoteAccepted(msg.sender, tokenId, quantity, payout);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 6: Implement TradeUpCrafting**

Create `packages/contracts/contracts/TradeUpCrafting.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CardToken} from "./CardToken.sol";

contract TradeUpCrafting is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    CardToken public immutable cardToken;

    struct Recipe {
        uint256[] inputTokenIds;
        uint256[] inputAmounts;
        uint256 outputTokenId;
        uint256 outputAmount;
        bool active;
    }

    mapping(uint256 recipeId => Recipe recipe) public recipes;

    event RecipeSet(uint256 indexed recipeId, uint256 outputTokenId, uint256 outputAmount);
    event Crafted(address indexed collector, uint256 indexed recipeId, uint256 outputTokenId, uint256 outputAmount);

    constructor(address admin, address cardToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        cardToken = CardToken(cardToken_);
    }

    function setRecipe(
        uint256 recipeId,
        uint256[] calldata inputTokenIds,
        uint256[] calldata inputAmounts,
        uint256 outputTokenId,
        uint256 outputAmount
    ) external onlyRole(OPERATOR_ROLE) {
        require(inputTokenIds.length == inputAmounts.length && inputTokenIds.length > 0, "bad inputs");
        recipes[recipeId] = Recipe(inputTokenIds, inputAmounts, outputTokenId, outputAmount, true);
        emit RecipeSet(recipeId, outputTokenId, outputAmount);
    }

    function craft(uint256 recipeId) external whenNotPaused nonReentrant {
        Recipe storage recipe = recipes[recipeId];
        require(recipe.active, "inactive recipe");
        for (uint256 i = 0; i < recipe.inputTokenIds.length; i++) {
            cardToken.burn(msg.sender, recipe.inputTokenIds[i], recipe.inputAmounts[i]);
        }
        cardToken.mint(msg.sender, recipe.outputTokenId, recipe.outputAmount, "");
        emit Crafted(msg.sender, recipeId, recipe.outputTokenId, recipe.outputAmount);
    }
}
```

- [ ] **Step 7: Implement RedemptionRegistry**

Create `packages/contracts/contracts/RedemptionRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CardToken} from "./CardToken.sol";

contract RedemptionRegistry is AccessControl, IERC1155Receiver, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum Status {
        None,
        Requested,
        Approved,
        Packed,
        Shipped,
        Completed,
        Cancelled
    }

    struct RedemptionRequest {
        address collector;
        uint256 tokenId;
        string metadataUri;
        Status status;
    }

    CardToken public immutable cardToken;
    uint256 public nextRequestId = 1;
    mapping(uint256 tokenId => bool redeemable) public redeemable;
    mapping(uint256 requestId => RedemptionRequest request) public requests;

    event RedeemableSet(uint256 indexed tokenId, bool redeemable);
    event RedemptionRequested(uint256 indexed requestId, address indexed collector, uint256 indexed tokenId, string metadataUri);
    event RedemptionStatusUpdated(uint256 indexed requestId, Status status);

    constructor(address admin, address cardToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        cardToken = CardToken(cardToken_);
    }

    function setRedeemable(uint256 tokenId, bool value) external onlyRole(OPERATOR_ROLE) {
        redeemable[tokenId] = value;
        emit RedeemableSet(tokenId, value);
    }

    function requestRedemption(uint256 tokenId, string calldata metadataUri) external whenNotPaused nonReentrant returns (uint256 requestId) {
        require(redeemable[tokenId], "not redeemable");
        requestId = nextRequestId++;
        requests[requestId] = RedemptionRequest(msg.sender, tokenId, metadataUri, Status.Requested);
        cardToken.safeTransferFrom(msg.sender, address(this), tokenId, 1, "");
        emit RedemptionRequested(requestId, msg.sender, tokenId, metadataUri);
    }

    function updateStatus(uint256 requestId, Status status) external onlyRole(OPERATOR_ROLE) {
        requests[requestId].status = status;
        emit RedemptionStatusUpdated(requestId, status);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/BuybackVault.test.ts test/TradeUpCrafting.test.ts test/RedemptionRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/contracts packages/contracts/test
git commit -m "feat: add buyback crafting and redemption"
```

---

### Task 8: Deployment, Seed, Verification, And Smoke Scripts

**Files:**
- Create: `packages/contracts/scripts/deploy.ts`
- Create: `packages/contracts/scripts/seed.ts`
- Create: `packages/contracts/scripts/verify.ts`
- Create: `packages/contracts/scripts/smoke.ts`
- Create: `packages/contracts/test/DeploymentConfig.test.ts`
- Create: `deployments/.gitkeep`
- Modify: `README.md`

- [ ] **Step 1: Write failing deployment config test**

Create `packages/contracts/test/DeploymentConfig.test.ts`:

```ts
import { expect } from "chai";
import config from "../hardhat.config";

describe("deployment config", () => {
  it("defines Robinhood Chain testnet", () => {
    const network = config.networks?.robinhoodTestnet as { chainId: number; url: string };
    expect(network.chainId).to.equal(46630);
    expect(network.url).to.contain("rpc.testnet.chain.robinhood.com");
  });
});
```

- [ ] **Step 2: Run deployment config test**

Run:

```bash
pnpm --filter @gacha/contracts test -- test/DeploymentConfig.test.ts
```

Expected: PASS.

- [ ] **Step 3: Implement deploy script**

Create `packages/contracts/scripts/deploy.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network, run } from "hardhat";

type ContractRecord = {
  address: string;
  transactionHash: string;
  blockNumber: number;
  explorerUrl: string;
};

async function waitDeployment(contract: Awaited<ReturnType<typeof ethers.deployContract>>) {
  await contract.waitForDeployment();
  const deploymentTx = contract.deploymentTransaction();
  if (!deploymentTx) throw new Error("missing deployment transaction");
  const receipt = await deploymentTx.wait();
  if (!receipt) throw new Error("missing deployment receipt");
  const address = await contract.getAddress();
  return {
    address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    explorerUrl: `https://explorer.testnet.chain.robinhood.com/address/${address}`,
  } satisfies ContractRecord;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const token = await ethers.deployContract("CardToken", [deployer.address, "ipfs://genesis-graders/"]);
  const tokenRecord = await waitDeployment(token);

  const seed = ethers.id(`genesis-graders-${Date.now()}`);
  const randomness = await ethers.deployContract("CommitRevealRandomnessProvider", [deployer.address, ethers.keccak256(seed)]);
  const randomnessRecord = await waitDeployment(randomness);

  const sale = await ethers.deployContract("PackSale", [
    deployer.address,
    tokenRecord.address,
    randomnessRecord.address,
    ethers.parseEther("0.01"),
    10000,
  ]);
  const saleRecord = await waitDeployment(sale);

  const market = await ethers.deployContract("Marketplace", [deployer.address, tokenRecord.address, deployer.address, 250]);
  const marketRecord = await waitDeployment(market);

  const buyback = await ethers.deployContract("BuybackVault", [deployer.address, tokenRecord.address]);
  const buybackRecord = await waitDeployment(buyback);

  const crafting = await ethers.deployContract("TradeUpCrafting", [deployer.address, tokenRecord.address]);
  const craftingRecord = await waitDeployment(crafting);

  const redemption = await ethers.deployContract("RedemptionRegistry", [deployer.address, tokenRecord.address]);
  const redemptionRecord = await waitDeployment(redemption);

  await token.grantRole(await token.MINTER_ROLE(), saleRecord.address);
  await token.grantRole(await token.MINTER_ROLE(), craftingRecord.address);
  await token.grantRole(await token.BURNER_ROLE(), craftingRecord.address);
  await randomness.grantRole(await randomness.CONSUMER_ROLE(), saleRecord.address);

  const registry = {
    chainId,
    network: network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      CardToken: tokenRecord,
      CommitRevealRandomnessProvider: randomnessRecord,
      PackSale: saleRecord,
      Marketplace: marketRecord,
      BuybackVault: buybackRecord,
      TradeUpCrafting: craftingRecord,
      RedemptionRegistry: redemptionRecord,
    },
  };

  const outputDir = path.resolve(process.cwd(), "../../deployments");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, `${network.name}.json`), JSON.stringify(registry, null, 2));
  console.log(JSON.stringify(registry, null, 2));

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await run("compile");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Implement seed, verify, and smoke scripts**

Create `packages/contracts/scripts/seed.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buybackQuotes, genesisGradersCards } from "@gacha/metadata";
import { ethers, network } from "hardhat";

async function main() {
  const registryPath = path.resolve(process.cwd(), "../../deployments", `${network.name}.json`);
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as { contracts: Record<string, { address: string }> };
  const sale = await ethers.getContractAt("PackSale", registry.contracts.PackSale.address);
  const buyback = await ethers.getContractAt("BuybackVault", registry.contracts.BuybackVault.address);
  const redemption = await ethers.getContractAt("RedemptionRegistry", registry.contracts.RedemptionRegistry.address);

  await sale.configureRarityBucket(0, 1, 30);
  await sale.configureRarityBucket(1, 31, 66);
  await sale.configureRarityBucket(2, 67, 96);
  await sale.configureRarityBucket(3, 97, 112);
  await sale.configureRarityBucket(4, 113, 118);
  await sale.configureRarityBucket(5, 119, 120);

  for (const card of genesisGradersCards) {
    await buyback.setQuote(card.tokenId, BigInt(buybackQuotes[card.tokenId]));
    if (card.redemptionEligible) await redemption.setRedeemable(card.tokenId, true);
  }

  console.log(`Seeded ${genesisGradersCards.length} cards on ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Create `packages/contracts/scripts/verify.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { network, run } from "hardhat";

async function main() {
  const registryPath = path.resolve(process.cwd(), "../../deployments", `${network.name}.json`);
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as { contracts: Record<string, { address: string }> };

  for (const [name, record] of Object.entries(registry.contracts)) {
    console.log(`Verifying ${name} at ${record.address}`);
    await run("verify:verify", { address: record.address, constructorArguments: [] }).catch((error: unknown) => {
      console.warn(`Verification skipped for ${name}:`, error);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Create `packages/contracts/scripts/smoke.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main() {
  const registryPath = path.resolve(process.cwd(), "../../deployments", `${network.name}.json`);
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as { contracts: Record<string, { address: string }> };
  const sale = await ethers.getContractAt("PackSale", registry.contracts.PackSale.address);
  const price = await sale.packPrice();
  const sold = await sale.sold();
  console.log(JSON.stringify({ network: network.name, packPrice: price.toString(), sold: sold.toString() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Create `deployments/.gitkeep` as an empty file.

- [ ] **Step 5: Run local compile and tests**

Run:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/scripts packages/contracts/test/DeploymentConfig.test.ts deployments/.gitkeep README.md
git commit -m "feat: add deployment and seed scripts"
```

---

### Task 9: Event Indexer Package

**Files:**
- Create: `packages/indexer/package.json`
- Create: `packages/indexer/tsconfig.json`
- Create: `packages/indexer/src/cache.ts`
- Create: `packages/indexer/src/config.ts`
- Create: `packages/indexer/src/server.ts`
- Create: `packages/indexer/src/index.ts`
- Create: `packages/indexer/src/__tests__/cache.test.ts`

- [ ] **Step 1: Create indexer package config**

Create `packages/indexer/package.json`:

```json
{
  "name": "@gacha/indexer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "@gacha/shared": "workspace:*",
    "hono": "^4.6.16",
    "viem": "^2.21.55"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "vitest": "^2.1.8"
  }
}
```

Create `packages/indexer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing event cache test**

Create `packages/indexer/src/__tests__/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EventCache } from "../cache";

describe("EventCache", () => {
  it("sorts activity by block and log index descending", () => {
    const cache = new EventCache();
    cache.add({ type: "PackPurchased", blockNumber: 10n, logIndex: 2, txHash: "0x2", payload: { buyer: "0xb" } });
    cache.add({ type: "ListingCreated", blockNumber: 11n, logIndex: 0, txHash: "0x3", payload: { seller: "0xc" } });
    cache.add({ type: "PackRevealed", blockNumber: 10n, logIndex: 3, txHash: "0x4", payload: { tokenId: "119" } });

    expect(cache.recent(2).map((event) => event.type)).toEqual(["ListingCreated", "PackRevealed"]);
  });
});
```

- [ ] **Step 3: Run failing indexer test**

Run:

```bash
pnpm --filter @gacha/indexer test -- src/__tests__/cache.test.ts
```

Expected: FAIL because `../cache` does not exist.

- [ ] **Step 4: Implement cache and config**

Create `packages/indexer/src/cache.ts`:

```ts
export type CachedEvent = {
  type: string;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
  payload: Record<string, unknown>;
};

export class EventCache {
  private events: CachedEvent[] = [];

  add(event: CachedEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
      return a.blockNumber > b.blockNumber ? -1 : 1;
    });
  }

  recent(limit = 50): CachedEvent[] {
    return this.events.slice(0, limit);
  }
}
```

Create `packages/indexer/src/config.ts`:

```ts
import { robinhoodTestnet } from "@gacha/shared";

export function getRpcUrl(): string {
  return process.env.ROBINHOOD_TESTNET_RPC_URL ?? robinhoodTestnet.rpcUrls.default.http[0];
}
```

Create `packages/indexer/src/index.ts`:

```ts
export * from "./cache";
export * from "./config";
```

- [ ] **Step 5: Implement HTTP server**

Create `packages/indexer/src/server.ts`:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { EventCache } from "./cache";

const app = new Hono();
const cache = new EventCache();

app.get("/health", (context) => context.json({ ok: true }));
app.get("/activity", (context) => context.json({ events: cache.recent(50) }));

const port = Number(process.env.INDEXER_PORT ?? 4311);

serve({ fetch: app.fetch, port });
console.log(`Indexer listening on http://localhost:${port}`);
```

Add dependency to `packages/indexer/package.json`:

```json
"@hono/node-server": "^1.13.7"
```

- [ ] **Step 6: Run indexer tests and build**

Run:

```bash
pnpm --filter @gacha/indexer test
pnpm --filter @gacha/indexer build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/indexer package.json pnpm-lock.yaml
git commit -m "feat: add event cache service"
```

---

### Task 10: Next.js App Shell, Wallet, And Design System

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/providers/web3-provider.tsx`
- Create: `apps/web/src/lib/chains.ts`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/status-pill.tsx`
- Create: `apps/web/src/components/__tests__/status-pill.test.tsx`

- [ ] **Step 1: Create web package config**

Create `apps/web/package.json`:

```json
{
  "name": "@gacha/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "next lint",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gacha/metadata": "workspace:*",
    "@gacha/shared": "workspace:*",
    "@rainbow-me/rainbowkit": "^2.2.1",
    "@tanstack/react-query": "^5.62.11",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "viem": "^2.21.55",
    "wagmi": "^2.14.6"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Write failing component test**

Create `apps/web/src/components/__tests__/status-pill.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { StatusPill } from "../status-pill";

describe("StatusPill", () => {
  it("renders compact premium status text", () => {
    render(<StatusPill tone="success">Vault verified</StatusPill>);
    expect(screen.getByText("Vault verified")).toHaveClass("border-[#00c805]/40");
  });
});
```

- [ ] **Step 3: Run failing web test**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/__tests__/status-pill.test.tsx
```

Expected: FAIL because `../status-pill` does not exist.

- [ ] **Step 4: Implement app config and global CSS**

Create `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gacha/shared", "@gacha/metadata"],
};

export default nextConfig;
```

Create `apps/web/postcss.config.mjs`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `apps/web/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050806",
        graphite: "#101713",
        panel: "#121b17",
        line: "#23332c",
        neon: "#00c805",
        bone: "#f5f7f2",
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

Create `apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  background: #050806;
  color: #f5f7f2;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 5: Implement provider, app shell, status pill, and page**

Create `apps/web/src/lib/chains.ts`:

```ts
export { robinhoodTestnet } from "@gacha/shared";
```

Create `apps/web/src/providers/web3-provider.tsx`:

```tsx
"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { robinhoodTestnet } from "@/lib/chains";

const config = getDefaultConfig({
  appName: "Atlas Vault",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "testnet-local",
  chains: [robinhoodTestnet],
  ssr: true,
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Create `apps/web/src/components/status-pill.tsx`:

```tsx
import clsx from "clsx";
import type { ReactNode } from "react";

type StatusPillProps = {
  tone: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
};

const toneClass = {
  neutral: "border-white/15 bg-white/[0.04] text-bone/80",
  success: "border-[#00c805]/40 bg-[#00c805]/10 text-[#9ff7aa]",
  warning: "border-[#f3c94d]/40 bg-[#f3c94d]/10 text-[#ffe58a]",
  danger: "border-[#ff5f6d]/40 bg-[#ff5f6d]/10 text-[#ff9aa3]",
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={clsx("inline-flex items-center rounded border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]", toneClass[tone])}>
      {children}
    </span>
  );
}
```

Create `apps/web/src/components/app-shell.tsx`:

```tsx
import { Activity, Boxes, Gem, Store } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "./status-pill";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(0,200,5,0.08),transparent_34%),#050806]">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded border border-line bg-panel/80 p-4">
          <div className="mb-8">
            <StatusPill tone="success">RH testnet</StatusPill>
            <h1 className="mt-4 text-2xl font-semibold">Atlas Vault</h1>
            <p className="mt-2 text-sm text-bone/55">Genesis Graders terminal</p>
          </div>
          <nav className="grid gap-2 text-sm text-bone/70">
            <span className="flex items-center gap-2"><Gem size={16} /> Drop</span>
            <span className="flex items-center gap-2"><Boxes size={16} /> Vault</span>
            <span className="flex items-center gap-2"><Store size={16} /> Market</span>
            <span className="flex items-center gap-2"><Activity size={16} /> Activity</span>
          </nav>
        </aside>
        <section className="rounded border border-line bg-graphite/70 p-4">{children}</section>
      </div>
    </main>
  );
}
```

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Web3Provider } from "@/providers/web3-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas Vault",
  description: "Robinhood Chain testnet gacha vault",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded border border-line bg-ink/40 p-5">
          <StatusPill tone="success">Vault verified</StatusPill>
          <h2 className="mt-4 text-4xl font-semibold">Genesis Graders</h2>
          <p className="mt-3 max-w-2xl text-bone/60">
            Open fictional testnet card packs, route reveals into vault, market, buyback, trade-up, or redemption flows.
          </p>
        </section>
        <section className="rounded border border-[#00c805]/30 bg-[#00c805]/[0.06] p-5">
          <StatusPill tone="warning">Demo randomness</StatusPill>
          <h3 className="mt-4 text-xl font-semibold">Live rip module</h3>
          <p className="mt-2 text-sm text-bone/60">Pack reveal actions appear here after contracts are connected.</p>
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 6: Run web tests and typecheck**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/__tests__/status-pill.test.tsx
pnpm --filter @gacha/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add premium web app shell"
```

---

### Task 11: Frontend Domain Data And Contract Clients

**Files:**
- Create: `apps/web/src/lib/contracts/abis.ts`
- Create: `apps/web/src/lib/contracts/addresses.ts`
- Create: `apps/web/src/lib/cards.ts`
- Create: `apps/web/src/lib/odds.ts`
- Create: `apps/web/src/lib/__tests__/odds.test.ts`
- Create: `apps/web/src/hooks/use-contract-addresses.ts`

- [ ] **Step 1: Write failing odds test**

Create `apps/web/src/lib/__tests__/odds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPackOddsRows } from "../odds";

describe("getPackOddsRows", () => {
  it("returns formatted rows that sum to 100 percent", () => {
    const rows = getPackOddsRows();
    expect(rows[0]).toEqual({ label: "Common", odds: "52.00%" });
    expect(rows.at(-1)).toEqual({ label: "Mythic", odds: "0.20%" });
  });
});
```

- [ ] **Step 2: Run failing odds test**

Run:

```bash
pnpm --filter @gacha/web test -- src/lib/__tests__/odds.test.ts
```

Expected: FAIL because `../odds` does not exist.

- [ ] **Step 3: Implement frontend domain helpers**

Create `apps/web/src/lib/cards.ts`:

```ts
import { genesisGradersCards } from "@gacha/metadata";

export const cards = genesisGradersCards;

export function getCardByTokenId(tokenId: number) {
  const card = cards.find((item) => item.tokenId === tokenId);
  if (!card) throw new Error(`Unknown card token ${tokenId}`);
  return card;
}
```

Create `apps/web/src/lib/odds.ts`:

```ts
import { formatBasisPoints, rarityLabels } from "@gacha/shared";
import { standardPackTable } from "@gacha/metadata";

export function getPackOddsRows() {
  return standardPackTable.entries.map((entry) => ({
    label: rarityLabels[entry.rarity],
    odds: formatBasisPoints(entry.oddsBps),
  }));
}
```

Create `apps/web/src/lib/contracts/addresses.ts`:

```ts
export type ContractAddresses = {
  CardToken: `0x${string}`;
  PackSale: `0x${string}`;
  Marketplace: `0x${string}`;
  BuybackVault: `0x${string}`;
  TradeUpCrafting: `0x${string}`;
  RedemptionRegistry: `0x${string}`;
};

export const emptyAddresses: Partial<ContractAddresses> = {};
```

Create `apps/web/src/lib/contracts/abis.ts`:

```ts
export const packSaleAbi = [
  { type: "function", name: "packPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buyPack", stateMutability: "payable", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const marketplaceAbi = [
  {
    type: "function",
    name: "createListing",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "unitPrice", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;
```

Create `apps/web/src/hooks/use-contract-addresses.ts`:

```ts
import { emptyAddresses } from "@/lib/contracts/addresses";

export function useContractAddresses() {
  return emptyAddresses;
}
```

- [ ] **Step 4: Run odds test and typecheck**

Run:

```bash
pnpm --filter @gacha/web test -- src/lib/__tests__/odds.test.ts
pnpm --filter @gacha/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/src/hooks
git commit -m "feat: add frontend domain data"
```

---

### Task 12: Drop Lobby And Pack Reveal Flow

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/drop/drop-lobby.tsx`
- Create: `apps/web/src/components/drop/odds-table.tsx`
- Create: `apps/web/src/components/drop/reveal-panel.tsx`
- Create: `apps/web/src/components/drop/__tests__/odds-table.test.tsx`

- [ ] **Step 1: Write failing odds table test**

Create `apps/web/src/components/drop/__tests__/odds-table.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { OddsTable } from "../odds-table";

describe("OddsTable", () => {
  it("renders visible odds and randomness disclosure", () => {
    render(<OddsTable />);
    expect(screen.getByText("Common")).toBeInTheDocument();
    expect(screen.getByText("52.00%")).toBeInTheDocument();
    expect(screen.getByText(/testnet\/demo randomness/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/drop/__tests__/odds-table.test.tsx
```

Expected: FAIL because `../odds-table` does not exist.

- [ ] **Step 3: Implement odds table**

Create `apps/web/src/components/drop/odds-table.tsx`:

```tsx
import { getPackOddsRows } from "@/lib/odds";
import { StatusPill } from "@/components/status-pill";

export function OddsTable() {
  return (
    <section className="rounded border border-line bg-ink/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase text-bone/70">Pack odds</h3>
        <StatusPill tone="warning">Testnet/demo randomness</StatusPill>
      </div>
      <div className="mt-4 grid gap-2">
        {getPackOddsRows().map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-line/70 py-2 text-sm">
            <span>{row.label}</span>
            <span className="font-mono text-[#00c805]">{row.odds}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement reveal panel**

Create `apps/web/src/components/drop/reveal-panel.tsx`:

```tsx
import { Zap } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export function RevealPanel() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded border border-[#00c805]/30 bg-[radial-gradient(circle_at_center,rgba(0,200,5,0.24),transparent_58%)] p-6">
      <div className="w-full max-w-sm rounded border border-line bg-graphite p-5 text-center shadow-2xl">
        <StatusPill tone="success">Streak x4</StatusPill>
        <div className="mx-auto my-8 grid h-64 w-44 place-items-center rounded-xl border-4 border-line bg-bone text-ink">
          <div>
            <Zap className="mx-auto mb-3 text-[#00c805]" />
            <p className="font-mono text-xs uppercase text-[#008f04]">Mythic signal</p>
            <p className="mt-2 text-2xl font-black">Tap to reveal</p>
          </div>
        </div>
        <p className="text-sm text-bone/55">After reveal, choose keep, list, buyback, trade-up, or redemption.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement drop lobby and wire homepage**

Create `apps/web/src/components/drop/drop-lobby.tsx`:

```tsx
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { OddsTable } from "./odds-table";
import { RevealPanel } from "./reveal-panel";
import { StatusPill } from "@/components/status-pill";

export function DropLobby() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="rounded border border-line bg-ink/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill tone="success">Vault verified</StatusPill>
          <ConnectButton />
        </div>
        <h2 className="mt-6 text-4xl font-semibold">Genesis Graders</h2>
        <p className="mt-3 max-w-2xl text-bone/60">
          Fictional graded cards with modeled vault custody, testnet marketplace liquidity, instant buyback, trade-up crafting, and redemption requests.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded border border-line p-4"><p className="text-xs text-bone/45">Set progress</p><p className="mt-2 text-2xl font-semibold">0 / 120</p></div>
          <div className="rounded border border-line p-4"><p className="text-xs text-bone/45">Pack price</p><p className="mt-2 text-2xl font-semibold">0.01 ETH</p></div>
          <div className="rounded border border-line p-4"><p className="text-xs text-bone/45">Daily chase</p><p className="mt-2 text-2xl font-semibold text-[#00c805]">Live</p></div>
        </div>
        <div className="mt-6">
          <OddsTable />
        </div>
      </section>
      <RevealPanel />
    </div>
  );
}
```

Modify `apps/web/src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { DropLobby } from "@/components/drop/drop-lobby";

export default function HomePage() {
  return (
    <AppShell>
      <DropLobby />
    </AppShell>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/drop/__tests__/odds-table.test.tsx
pnpm --filter @gacha/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat: add drop lobby reveal flow"
```

---

### Task 13: Collection, Marketplace, Crafting, Redemption, And Admin Screens

**Files:**
- Create: `apps/web/src/components/vault/collection-grid.tsx`
- Create: `apps/web/src/components/market/marketplace-panel.tsx`
- Create: `apps/web/src/components/crafting/trade-up-panel.tsx`
- Create: `apps/web/src/components/redemption/redemption-panel.tsx`
- Create: `apps/web/src/components/admin/admin-panel.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/vault/__tests__/collection-grid.test.tsx`

- [ ] **Step 1: Write failing collection grid test**

Create `apps/web/src/components/vault/__tests__/collection-grid.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { CollectionGrid } from "../collection-grid";

describe("CollectionGrid", () => {
  it("renders premium fictional card metadata", () => {
    render(<CollectionGrid />);
    expect(screen.getByText("Aether Lynx")).toBeInTheDocument();
    expect(screen.getByText(/GG-000001/)).toBeInTheDocument();
    expect(screen.getByText(/Gem/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing collection grid test**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/vault/__tests__/collection-grid.test.tsx
```

Expected: FAIL because `../collection-grid` does not exist.

- [ ] **Step 3: Implement collection grid**

Create `apps/web/src/components/vault/collection-grid.tsx`:

```tsx
import { cards } from "@/lib/cards";
import { StatusPill } from "@/components/status-pill";

export function CollectionGrid() {
  return (
    <section className="rounded border border-line bg-ink/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Vault collection</h3>
        <StatusPill tone="neutral">Modeled custody</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.slice(0, 8).map((card) => (
          <article key={card.tokenId} className="rounded border border-line bg-graphite p-3">
            <div className="aspect-[5/7] rounded bg-bone p-3 text-ink">
              <p className="font-mono text-xs">{card.certId}</p>
              <h4 className="mt-8 text-xl font-black">{card.name}</h4>
              <p className="mt-2 text-sm">{card.rarity.toUpperCase()} • Grade {card.grade}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-bone/55">
              <span>Pop {card.populationCount}</span>
              <span>{card.redemptionEligible ? "Redeemable" : "Vaulted"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement marketplace panel**

Create `apps/web/src/components/market/marketplace-panel.tsx`:

```tsx
import { Store } from "lucide-react";
import { cards } from "@/lib/cards";
import { StatusPill } from "@/components/status-pill";

export function MarketplacePanel() {
  return (
    <section className="rounded border border-line bg-ink/40 p-5">
      <div className="flex items-center gap-2">
        <Store size={18} className="text-[#00c805]" />
        <h3 className="text-xl font-semibold">Market floor</h3>
        <StatusPill tone="success">Buy now</StatusPill>
      </div>
      <div className="mt-4 grid gap-2">
        {cards.slice(0, 5).map((card, index) => (
          <div key={card.tokenId} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line py-2 text-sm">
            <span>{card.name}</span>
            <span className="font-mono text-bone/55">Grade {card.grade}</span>
            <span className="font-mono text-[#00c805]">{(0.01 + index * 0.007).toFixed(3)} ETH</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement crafting, redemption, and admin panels**

Create `apps/web/src/components/crafting/trade-up-panel.tsx`:

```tsx
import { Hammer } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export function TradeUpPanel() {
  return (
    <section className="rounded border border-line bg-ink/40 p-5">
      <div className="flex items-center gap-2">
        <Hammer size={18} className="text-[#00c805]" />
        <h3 className="text-xl font-semibold">Trade-up crafting</h3>
      </div>
      <div className="mt-4 rounded border border-[#00c805]/30 bg-[#00c805]/[0.06] p-4">
        <StatusPill tone="success">Recipe #1</StatusPill>
        <p className="mt-3 text-sm text-bone/65">Burn 5 common duplicates to mint a Genesis Trade-Up Pack.</p>
      </div>
    </section>
  );
}
```

Create `apps/web/src/components/redemption/redemption-panel.tsx`:

```tsx
import { ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export function RedemptionPanel() {
  return (
    <section className="rounded border border-line bg-ink/40 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[#00c805]" />
        <h3 className="text-xl font-semibold">Redemption desk</h3>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-bone/65">
        <p>Eligible legendary and mythic cards can enter a modeled redemption workflow.</p>
        <StatusPill tone="warning">Testnet fulfillment model</StatusPill>
      </div>
    </section>
  );
}
```

Create `apps/web/src/components/admin/admin-panel.tsx`:

```tsx
import { Terminal } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export function AdminPanel() {
  if (process.env.NEXT_PUBLIC_ENABLE_TESTNET_ADMIN !== "true") return null;

  return (
    <section className="rounded border border-line bg-ink/40 p-5">
      <div className="flex items-center gap-2">
        <Terminal size={18} className="text-[#00c805]" />
        <h3 className="text-xl font-semibold">Testnet operations</h3>
        <StatusPill tone="danger">Owner only</StatusPill>
      </div>
      <p className="mt-3 text-sm text-bone/60">Admin actions mirror deployment scripts for drop, quote, recipe, and redemption management.</p>
    </section>
  );
}
```

- [ ] **Step 6: Wire panels into homepage**

Modify `apps/web/src/app/page.tsx`:

```tsx
import { AdminPanel } from "@/components/admin/admin-panel";
import { AppShell } from "@/components/app-shell";
import { TradeUpPanel } from "@/components/crafting/trade-up-panel";
import { DropLobby } from "@/components/drop/drop-lobby";
import { MarketplacePanel } from "@/components/market/marketplace-panel";
import { RedemptionPanel } from "@/components/redemption/redemption-panel";
import { CollectionGrid } from "@/components/vault/collection-grid";

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-4">
        <DropLobby />
        <CollectionGrid />
        <div className="grid gap-4 xl:grid-cols-3">
          <MarketplacePanel />
          <TradeUpPanel />
          <RedemptionPanel />
        </div>
        <AdminPanel />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm --filter @gacha/web test -- src/components/vault/__tests__/collection-grid.test.tsx
pnpm --filter @gacha/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat: add collection market crafting redemption screens"
```

---

### Task 14: Full Verification And Testnet Readiness

**Files:**
- Modify: `README.md`
- Create: `docs/testnet-runbook.md`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/home.spec.ts`

- [ ] **Step 1: Add Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

Add these dev dependencies to `apps/web/package.json`:

```json
"@playwright/test": "^1.49.1"
```

Add this script to `apps/web/package.json`:

```json
"e2e": "playwright test"
```

- [ ] **Step 2: Write e2e smoke test**

Create `apps/web/e2e/home.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home renders premium testnet vault experience", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atlas Vault" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Genesis Graders" })).toBeVisible();
  await expect(page.getByText("Testnet/demo randomness")).toBeVisible();
  await expect(page.getByText("Aether Lynx")).toBeVisible();
});
```

- [ ] **Step 3: Add runbook**

Create `docs/testnet-runbook.md`:

```markdown
# Testnet Runbook

## Local Verification

```bash
pnpm install
pnpm metadata build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Robinhood Chain Testnet Deployment

1. Copy `.env.example` to `.env`.
2. Set `ROBINHOOD_TESTNET_PRIVATE_KEY`.
3. Fund the deployer with Robinhood Chain testnet ETH.
4. Run `pnpm contracts deploy:testnet`.
5. Run `pnpm contracts seed:testnet`.
6. Run `pnpm contracts verify:testnet`.
7. Run `pnpm contracts smoke:testnet`.
8. Start the indexer with `pnpm indexer start --network robinhoodTestnet`.
9. Start the web app with `pnpm web dev`.

## Product Safety Checks

- Odds are visible before pack purchase.
- Testnet randomness disclosure is visible.
- Redemption copy states that fulfillment is modeled on testnet.
- No real card IP appears in metadata or UI.
- No Robinhood logo or official affiliation appears in the app.
```

- [ ] **Step 4: Run full local verification**

Run:

```bash
pnpm metadata build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gacha/web e2e
```

Expected: all commands exit with code `0`.

- [ ] **Step 5: Run visual QA**

Start the app:

```bash
pnpm web dev
```

Open `http://localhost:3000` in the browser and verify:

- Desktop shows sidebar, drop lobby, reveal module, collection grid, market, crafting, redemption, and no overlapping text.
- Mobile shows the same sections stacked without horizontal overflow.
- Palette reads black/off-white/graphite/neon green with restrained hacker accents.
- No Robinhood logo or official-affiliation copy appears.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/testnet-runbook.md apps/web/playwright.config.ts apps/web/e2e apps/web/package.json pnpm-lock.yaml
git commit -m "test: add full app verification runbook"
```

---

## Final Acceptance

The implementation is complete when these commands pass locally:

```bash
pnpm metadata build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gacha/web e2e
```

The Robinhood Chain testnet release is ready when:

- `pnpm contracts deploy:testnet` writes `deployments/robinhoodTestnet.json`.
- `pnpm contracts seed:testnet` configures buckets, quotes, recipes, and redeemability.
- `pnpm contracts smoke:testnet` reads live deployed contract state.
- The web app connects to chain ID `46630`.
- The public UI shows odds, testnet randomness disclosure, and modeled redemption disclosure before pack purchase.
