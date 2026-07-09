# Phase 4 Live Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Phase 3 web app to the deployed Robinhood Chain testnet contracts with live read state, wallet connection, chain switching, and guarded transaction surfaces.

**Architecture:** Keep the existing route structure and add a focused `apps/web/src/lib/contracts` boundary for registry validation, viem public reads, and EIP-1193 wallet helpers. Add wallet/live-status UI on the dashboard and reuse a small guard component across drop, reveal, market, Forge, and redemption surfaces so write actions are visibly testnet-ready without sending Phase 4B transactions.

**Tech Stack:** Next.js App Router, React 18, TypeScript, viem, Vitest, Testing Library, jsdom, lucide-react, pnpm workspaces, deployed Robinhood testnet registry.

---

## Source Spec

Implement against `docs/superpowers/specs/2026-07-09-phase-4-live-contracts-design.md`.

Important constraints:

- Never expose `DEPLOYER_PRIVATE_KEY` or any private env value in web code, tests, docs, or UI.
- Wallet requests happen only after a user click.
- Phase 4A never sends pack, market, Forge, redemption, or approval transactions.
- Missing registry, unsupported chain, and RPC failure must degrade gracefully.
- Add `viem` as a direct `@gacha/web` dependency because web code imports it directly.

## File Structure

Create and modify these files:

- Modify `apps/web/package.json`: add direct `viem` dependency.
- Modify `pnpm-lock.yaml`: lock the web dependency addition.
- Modify `.env.example`: add optional public browser RPC variable.
- Create `apps/web/src/lib/contracts/abis.ts`: minimal read ABIs.
- Create `apps/web/src/lib/contracts/registry.ts`: typed contract registry extraction.
- Create `apps/web/src/lib/contracts/public-client.ts`: viem public-client factory.
- Create `apps/web/src/lib/contracts/live-state.ts`: graceful protocol read model.
- Create `apps/web/src/lib/contracts/wallet.ts`: browser-safe wallet helpers.
- Create `apps/web/src/lib/contracts/__tests__/registry.test.ts`: registry extraction tests.
- Create `apps/web/src/lib/contracts/__tests__/live-state.test.ts`: live read success and degraded tests.
- Create `apps/web/src/lib/contracts/__tests__/wallet.test.ts`: wallet helper tests.
- Create `apps/web/src/components/wallet-connect-panel.tsx`: client wallet connection panel.
- Create `apps/web/src/components/live-protocol-panel.tsx`: server live protocol panel.
- Create `apps/web/src/components/action-guard-panel.tsx`: reusable guarded action status.
- Create `apps/web/src/components/__tests__/wallet-connect-panel.test.tsx`: wallet panel tests.
- Modify `apps/web/src/components/app-shell.tsx`: replace demo wallet card with the live wallet panel.
- Modify `apps/web/src/components/drop-lobby.tsx`: add pack reserve guard.
- Modify `apps/web/src/components/reveal-panel.tsx`: show connected but guarded next actions.
- Modify `apps/web/src/components/market-board.tsx`: add marketplace approval/list guard.
- Modify `apps/web/src/components/forge-workbench.tsx`: add Forge approval/craft guard.
- Modify `apps/web/src/components/redemption-timeline.tsx`: add redemption request guard.
- Modify `apps/web/src/app/page.tsx`: render live protocol panel.
- Modify `apps/web/src/app/globals.css`: style wallet, live protocol, and guard states.
- Modify `apps/web/src/components/__tests__/dashboard.test.tsx`: assert dashboard live and guarded surfaces.
- Modify `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`: assert market and redemption guards.
- Modify `apps/web/src/components/__tests__/forge-admin.test.tsx`: assert Forge guard.

## Task 1: Add Contract Registry Helpers

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Create: `apps/web/src/lib/contracts/abis.ts`
- Create: `apps/web/src/lib/contracts/registry.ts`
- Test: `apps/web/src/lib/contracts/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

Create `apps/web/src/lib/contracts/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getReadyContractRegistry } from "../registry";

const completeRegistry = {
  network: "robinhoodTestnet",
  chainId: 46630,
  timestamp: "2026-07-09T15:03:54.201Z",
  contracts: {
    InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
    ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
    CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
    PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
    Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
    BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
    Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
    RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
  }
};

describe("contract registry helpers", () => {
  it("returns typed addresses for a ready Robinhood testnet registry", () => {
    const registry = getReadyContractRegistry(completeRegistry);

    expect(registry.status.readiness).toBe("ready");
    expect(registry.contracts.PackSale).toBe(completeRegistry.contracts.PackSale);
    expect(registry.chainId).toBe(46630);
  });

  it("keeps contracts unavailable when registry is missing", () => {
    const registry = getReadyContractRegistry(null);

    expect(registry.status.readiness).toBe("demo");
    expect(registry.contracts).toBe(null);
  });
});
```

- [ ] **Step 2: Run the registry test and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- registry
```

Expected: FAIL because `apps/web/src/lib/contracts/registry.ts` does not exist.

- [ ] **Step 3: Add the dependency and ABI/registry implementation**

Update `apps/web/package.json` dependencies:

```json
"viem": "^2.31.7"
```

Append to `.env.example`:

```dotenv
NEXT_PUBLIC_GACHA_RPC_URL=https://rpc.testnet.chain.robinhood.com
```

Create `apps/web/src/lib/contracts/abis.ts`:

```ts
export const packSaleAbi = [
  { type: "function", name: "nextDropId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextPurchaseId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasuryCredit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "remainingInventory",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  }
] as const;

export const marketplaceAbi = [
  { type: "function", name: "nextListingId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] }
] as const;

export const forgeAbi = [
  { type: "function", name: "nextRecipeId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "recipes",
    stateMutability: "view",
    inputs: [{ name: "recipeId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "outputTokenId", type: "uint256" },
          { name: "outputAmount", type: "uint256" },
          { name: "outputUri", type: "string" },
          { name: "fee", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "maxTotalCrafts", type: "uint256" },
          { name: "maxCraftsPerWallet", type: "uint256" },
          { name: "totalCrafts", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "requiresManualReview", type: "bool" },
          { name: "excludeGrailProtectedInputs", type: "bool" },
          { name: "exists", type: "bool" }
        ]
      }
    ]
  }
] as const;

export const redemptionRegistryAbi = [
  { type: "function", name: "nextRequestId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
] as const;

export const itemTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;
```

Create `apps/web/src/lib/contracts/registry.ts`:

```ts
import type { Address } from "viem";
import {
  type DeploymentRegistrySnapshot,
  type DeploymentStatus,
  requiredProtocolContracts,
  resolveDeploymentStatus
} from "../deployments";

export type ProtocolContractName = (typeof requiredProtocolContracts)[number];
export type ProtocolContracts = Record<ProtocolContractName, Address>;

export type ReadyContractRegistry = {
  status: DeploymentStatus;
  chainId: number;
  contracts: ProtocolContracts | null;
};

export function getReadyContractRegistry(snapshot: DeploymentRegistrySnapshot | null): ReadyContractRegistry {
  const status = resolveDeploymentStatus(snapshot);

  if (status.readiness !== "ready" || snapshot?.contracts === undefined) {
    return { status, chainId: status.chainId, contracts: null };
  }

  const contracts = Object.fromEntries(
    requiredProtocolContracts.map((name) => [name, snapshot.contracts?.[name] as Address])
  ) as ProtocolContracts;

  return { status, chainId: status.chainId, contracts };
}
```

- [ ] **Step 4: Install and verify GREEN**

Run:

```bash
pnpm install
pnpm --filter @gacha/web test -- registry
```

Expected: PASS.

- [ ] **Step 5: Commit registry helpers**

```bash
git add .env.example apps/web/package.json pnpm-lock.yaml apps/web/src/lib/contracts
git commit -m "feat: add web contract registry helpers"
```

## Task 2: Add Live Protocol Snapshot Reads

**Files:**

- Create: `apps/web/src/lib/contracts/public-client.ts`
- Create: `apps/web/src/lib/contracts/live-state.ts`
- Create: `apps/web/src/lib/contracts/__tests__/live-state.test.ts`
- Create: `apps/web/src/components/live-protocol-panel.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/__tests__/dashboard.test.tsx`

- [ ] **Step 1: Write failing live-state tests**

Create `apps/web/src/lib/contracts/__tests__/live-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getLiveProtocolSnapshot, type ProtocolReadClient } from "../live-state";

const addresses = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
};

const registry = {
  network: "robinhoodTestnet",
  chainId: 46630,
  contracts: addresses
};

describe("live protocol state", () => {
  it("returns demo state without a ready registry", async () => {
    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: null });

    expect(snapshot.state).toBe("demo");
    expect(snapshot.metrics).toHaveLength(0);
  });

  it("returns ready metrics from a read client", async () => {
    const client: ProtocolReadClient = {
      readContract: async ({ functionName }) => {
        const values: Record<string, bigint> = {
          nextDropId: 2n,
          nextPurchaseId: 1n,
          treasuryCredit: 0n,
          remainingInventory: 3n,
          nextListingId: 1n,
          feeBps: 250n,
          nextRecipeId: 3n,
          nextRequestId: 1n
        };
        return values[String(functionName)] ?? 0n;
      }
    };

    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: registry, client });

    expect(snapshot.state).toBe("ready");
    expect(snapshot.metrics.map((metric) => metric.label)).toContain("Drops created");
    expect(snapshot.metrics.find((metric) => metric.label === "Market fee")?.value).toBe("250 bps");
  });

  it("returns degraded state when an RPC read fails", async () => {
    const client: ProtocolReadClient = {
      readContract: async () => {
        throw new Error("rpc unavailable");
      }
    };

    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: registry, client });

    expect(snapshot.state).toBe("degraded");
    expect(snapshot.message).toMatch(/rpc unavailable/i);
  });
});
```

- [ ] **Step 2: Run live-state tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- live-state
```

Expected: FAIL because `live-state.ts` does not exist.

- [ ] **Step 3: Implement public client and live snapshot**

Create `apps/web/src/lib/contracts/public-client.ts`:

```ts
import { robinhoodChainTestnet } from "@gacha/shared";
import { createPublicClient, http } from "viem";

export function createRobinhoodPublicClient(rpcUrl = process.env.NEXT_PUBLIC_GACHA_RPC_URL) {
  const fallbackRpc = robinhoodChainTestnet.rpcUrls.default.http[0];

  return createPublicClient({
    chain: robinhoodChainTestnet,
    transport: http(rpcUrl && rpcUrl.trim().length > 0 ? rpcUrl : fallbackRpc)
  });
}
```

Create `apps/web/src/lib/contracts/live-state.ts`:

```ts
import type { Abi, Address } from "viem";
import type { DeploymentRegistrySnapshot } from "../deployments";
import { forgeAbi, marketplaceAbi, packSaleAbi, redemptionRegistryAbi } from "./abis";
import { createRobinhoodPublicClient } from "./public-client";
import { getReadyContractRegistry } from "./registry";

export type ProtocolReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type LiveProtocolMetric = {
  label: string;
  value: string;
  detail: string;
};

export type LiveProtocolSnapshot = {
  state: "demo" | "ready" | "degraded";
  title: string;
  message: string;
  metrics: LiveProtocolMetric[];
};

type LiveProtocolOptions = {
  registrySnapshot: DeploymentRegistrySnapshot | null;
  client?: ProtocolReadClient;
};

const formatBigint = (value: unknown): string => (typeof value === "bigint" ? value.toString() : "0");

async function readBigint(
  client: ProtocolReadClient,
  address: Address,
  abi: Abi,
  functionName: string,
  args?: readonly unknown[]
): Promise<bigint> {
  const value = await client.readContract({ address, abi, functionName, args });
  return typeof value === "bigint" ? value : BigInt(Number(value));
}

export async function getLiveProtocolSnapshot({
  registrySnapshot,
  client = createRobinhoodPublicClient()
}: LiveProtocolOptions): Promise<LiveProtocolSnapshot> {
  const registry = getReadyContractRegistry(registrySnapshot);

  if (registry.contracts === null) {
    return {
      state: "demo",
      title: "Live protocol offline",
      message: registry.status.message,
      metrics: []
    };
  }

  try {
    const [
      nextDropId,
      nextPurchaseId,
      treasuryCredit,
      remainingInventory,
      nextListingId,
      feeBps,
      nextRecipeId,
      nextRequestId
    ] = await Promise.all([
      readBigint(client, registry.contracts.PackSale, packSaleAbi, "nextDropId"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi, "nextPurchaseId"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi, "treasuryCredit"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi, "remainingInventory", [1n]).catch(() => 0n),
      readBigint(client, registry.contracts.Marketplace, marketplaceAbi, "nextListingId"),
      readBigint(client, registry.contracts.Marketplace, marketplaceAbi, "feeBps"),
      readBigint(client, registry.contracts.Forge, forgeAbi, "nextRecipeId"),
      readBigint(client, registry.contracts.RedemptionRegistry, redemptionRegistryAbi, "nextRequestId")
    ]);

    return {
      state: "ready",
      title: "Live protocol connected",
      message: `Reading Robinhood testnet contracts on chain ${registry.chainId}.`,
      metrics: [
        { label: "Drops created", value: formatBigint(nextDropId - 1n), detail: "PackSale.nextDropId" },
        { label: "Purchases opened", value: formatBigint(nextPurchaseId - 1n), detail: "PackSale.nextPurchaseId" },
        { label: "Drop 1 inventory", value: formatBigint(remainingInventory), detail: "PackSale.remainingInventory" },
        { label: "Treasury credit", value: `${formatBigint(treasuryCredit)} wei`, detail: "PackSale.treasuryCredit" },
        { label: "Listings created", value: formatBigint(nextListingId - 1n), detail: "Marketplace.nextListingId" },
        { label: "Market fee", value: `${formatBigint(feeBps)} bps`, detail: "Marketplace.feeBps" },
        { label: "Recipes created", value: formatBigint(nextRecipeId - 1n), detail: "Forge.nextRecipeId" },
        { label: "Redemptions opened", value: formatBigint(nextRequestId - 1n), detail: "RedemptionRegistry.nextRequestId" }
      ]
    };
  } catch (error) {
    return {
      state: "degraded",
      title: "Live protocol degraded",
      message: error instanceof Error ? error.message : "Robinhood testnet RPC read failed.",
      metrics: []
    };
  }
}
```

- [ ] **Step 4: Add dashboard live protocol panel test**

Append to `apps/web/src/components/__tests__/dashboard.test.tsx`:

```tsx
it("shows the live protocol panel and guarded action copy", async () => {
  render(await HomePage());

  expect(screen.getByText(/Live protocol/i)).toBeInTheDocument();
  expect(screen.getByText(/Phase 4A guard/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Implement `LiveProtocolPanel` and render it on the dashboard**

Create `apps/web/src/components/live-protocol-panel.tsx`:

```tsx
import { RadioTower } from "lucide-react";
import { getLiveProtocolSnapshot } from "../lib/contracts/live-state";
import { loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";

export async function LiveProtocolPanel() {
  const snapshot = await getLiveProtocolSnapshot({
    registrySnapshot: loadDeploymentRegistrySnapshotFromEnv()
  });

  return (
    <section className="panel live-protocol-panel" aria-labelledby="live-protocol-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Live protocol</span>
          <h2 id="live-protocol-title">{snapshot.title}</h2>
        </div>
        <span className={`chain-pill protocol-${snapshot.state}`}>
          <RadioTower size={14} aria-hidden="true" />
          {snapshot.state}
        </span>
      </div>
      <p>{snapshot.message}</p>
      <dl className="live-protocol-grid">
        {snapshot.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <small>{metric.detail}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

Update `apps/web/src/app/page.tsx` so `HomePage` is async, imports `LiveProtocolPanel`, and renders it after `StatusRail`.

- [ ] **Step 6: Verify and commit live reads**

Run:

```bash
pnpm --filter @gacha/web test -- live-state dashboard
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/lib/contracts apps/web/src/components/live-protocol-panel.tsx apps/web/src/app/page.tsx apps/web/src/components/__tests__/dashboard.test.tsx
git commit -m "feat: add live protocol read panel"
```

## Task 3: Add Wallet Helpers And Wallet Panel

**Files:**

- Create: `apps/web/src/lib/contracts/wallet.ts`
- Create: `apps/web/src/lib/contracts/__tests__/wallet.test.ts`
- Create: `apps/web/src/components/wallet-connect-panel.tsx`
- Create: `apps/web/src/components/__tests__/wallet-connect-panel.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Write failing wallet helper tests**

Create `apps/web/src/lib/contracts/__tests__/wallet.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  formatWalletAddress,
  getRobinhoodAddChainParameters,
  requestWalletAccounts,
  toHexChainId
} from "../wallet";

describe("wallet helpers", () => {
  it("formats addresses for compact UI", () => {
    expect(formatWalletAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234...5678");
  });

  it("formats decimal chain IDs as wallet hex IDs", () => {
    expect(toHexChainId(46630)).toBe("0xb626");
  });

  it("builds Robinhood testnet add-chain params", () => {
    expect(getRobinhoodAddChainParameters().chainId).toBe("0xb626");
    expect(getRobinhoodAddChainParameters().chainName).toBe("Robinhood Chain Testnet");
  });

  it("requests wallet accounts only through the provider request method", async () => {
    const provider = {
      request: vi.fn().mockResolvedValue(["0x1234567890abcdef1234567890abcdef12345678"])
    };

    await expect(requestWalletAccounts(provider)).resolves.toEqual([
      "0x1234567890abcdef1234567890abcdef12345678"
    ]);
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });
});
```

- [ ] **Step 2: Run wallet helper tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- wallet
```

Expected: FAIL because `wallet.ts` does not exist.

- [ ] **Step 3: Implement wallet helpers**

Create `apps/web/src/lib/contracts/wallet.ts`:

```ts
import { robinhoodChainTestnet } from "@gacha/shared";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export const robinhoodTestnetChainId = robinhoodChainTestnet.id;

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function formatWalletAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getRobinhoodAddChainParameters() {
  return {
    chainId: toHexChainId(robinhoodChainTestnet.id),
    chainName: robinhoodChainTestnet.name,
    nativeCurrency: robinhoodChainTestnet.nativeCurrency,
    rpcUrls: robinhoodChainTestnet.rpcUrls.default.http,
    blockExplorerUrls: [robinhoodChainTestnet.blockExplorers.default.url]
  };
}

export async function requestWalletAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return Array.isArray(accounts) ? accounts.filter((account): account is string => typeof account === "string") : [];
}

export async function readWalletAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_accounts" });
  return Array.isArray(accounts) ? accounts.filter((account): account is string => typeof account === "string") : [];
}

export async function readWalletChainId(provider: Eip1193Provider): Promise<number | null> {
  const chainId = await provider.request({ method: "eth_chainId" });
  return typeof chainId === "string" ? Number.parseInt(chainId, 16) : null;
}

export async function switchToRobinhoodTestnet(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(robinhoodChainTestnet.id) }]
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [getRobinhoodAddChainParameters()]
      });
      return;
    }

    throw error;
  }
}
```

- [ ] **Step 4: Write wallet panel tests**

Create `apps/web/src/components/__tests__/wallet-connect-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletConnectPanel } from "../wallet-connect-panel";

describe("WalletConnectPanel", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ethereum");
  });

  it("does not request wallet accounts on page load", () => {
    const request = vi.fn().mockResolvedValue([]);
    Object.defineProperty(window, "ethereum", { value: { request }, configurable: true });

    render(<WalletConnectPanel />);

    expect(request).not.toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument();
  });

  it("connects and shows a wrong-chain switch action", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(["0x1234567890abcdef1234567890abcdef12345678"])
      .mockResolvedValueOnce("0x1");
    Object.defineProperty(window, "ethereum", { value: { request }, configurable: true });

    render(<WalletConnectPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Connect wallet/i }));

    await waitFor(() => expect(screen.getByText("0x1234...5678")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Switch to testnet/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement wallet panel and app shell integration**

Create `apps/web/src/components/wallet-connect-panel.tsx` and replace the `wallet-card` block in `AppShell` with `<WalletConnectPanel />`.

The component must:

- Use `"use client"`.
- Read `window.ethereum` only inside effects or event handlers.
- Render "No wallet detected" when missing.
- Render a "Connect wallet" button before account request.
- Render compact address and current chain after connect.
- Render "Switch to testnet" when connected on a different chain.
- Call `switchToRobinhoodTestnet` only when the switch button is clicked.

- [ ] **Step 6: Verify and commit wallet panel**

Run:

```bash
pnpm --filter @gacha/web test -- wallet
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/lib/contracts/wallet.ts apps/web/src/lib/contracts/__tests__/wallet.test.ts apps/web/src/components/wallet-connect-panel.tsx apps/web/src/components/__tests__/wallet-connect-panel.test.tsx apps/web/src/components/app-shell.tsx
git commit -m "feat: add testnet wallet connection panel"
```

## Task 4: Add Guarded Action Panels

**Files:**

- Create: `apps/web/src/components/action-guard-panel.tsx`
- Modify: `apps/web/src/components/drop-lobby.tsx`
- Modify: `apps/web/src/components/reveal-panel.tsx`
- Modify: `apps/web/src/components/market-board.tsx`
- Modify: `apps/web/src/components/forge-workbench.tsx`
- Modify: `apps/web/src/components/redemption-timeline.tsx`
- Modify: `apps/web/src/components/__tests__/dashboard.test.tsx`
- Modify: `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`
- Modify: `apps/web/src/components/__tests__/forge-admin.test.tsx`

- [ ] **Step 1: Write failing guard UI assertions**

Add these expectations to the existing component tests:

```tsx
expect(screen.getByText(/Phase 4A guard/i)).toBeInTheDocument();
expect(screen.getByText(/Connect wallet before this action can send a testnet transaction/i)).toBeInTheDocument();
expect(screen.getByText(/Transaction submission lands in Phase 4B/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run route component tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- dashboard vault-market-redemption forge-admin
```

Expected: FAIL because `ActionGuardPanel` does not exist and the guard copy is not rendered.

- [ ] **Step 3: Implement reusable guard panel**

Create `apps/web/src/components/action-guard-panel.tsx`:

```tsx
import { LockKeyhole } from "lucide-react";

type ActionGuardPanelProps = {
  action: string;
  operator?: string;
};

export function ActionGuardPanel({ action, operator }: ActionGuardPanelProps) {
  return (
    <aside className="action-guard-panel" aria-label={`${action} transaction guard`}>
      <div>
        <span className="eyebrow">Phase 4A guard</span>
        <strong>{action}</strong>
      </div>
      <p>Connect wallet before this action can send a testnet transaction.</p>
      {operator ? <small>Approval target: {operator}</small> : null}
      <small>Transaction submission lands in Phase 4B after confirmation, receipt, and retry states are added.</small>
      <LockKeyhole size={16} aria-hidden="true" />
    </aside>
  );
}
```

- [ ] **Step 4: Integrate guards into action surfaces**

Update components:

- `DropLobby`: render `<ActionGuardPanel action="Reserve pack" operator="PackSale" />` below the reserve button.
- `RevealPanel`: render `<ActionGuardPanel action="Reveal next action" />` below the action grid.
- `MarketBoard`: render `<ActionGuardPanel action="List item" operator="Marketplace" />` inside each listing card after the disabled button.
- `ForgeWorkbench`: render `<ActionGuardPanel action="Craft recipe" operator="Forge" />` in the output preview.
- `RedemptionTimeline`: render `<ActionGuardPanel action="Request redemption" operator="RedemptionRegistry" />` after request cards.

- [ ] **Step 5: Verify and commit guarded actions**

Run:

```bash
pnpm --filter @gacha/web test -- dashboard vault-market-redemption forge-admin
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/components/action-guard-panel.tsx apps/web/src/components/drop-lobby.tsx apps/web/src/components/reveal-panel.tsx apps/web/src/components/market-board.tsx apps/web/src/components/forge-workbench.tsx apps/web/src/components/redemption-timeline.tsx apps/web/src/components/__tests__
git commit -m "feat: guard live testnet actions"
```

## Task 5: Polish Styles And Full Verification

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/__tests__/dashboard.test.tsx`

- [ ] **Step 1: Add CSS for live and wallet states**

Add CSS classes:

```css
.live-protocol-panel,
.wallet-connect-panel,
.action-guard-panel {
  position: relative;
}

.live-protocol-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0 0;
}

.live-protocol-grid div,
.action-guard-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  padding: 12px;
}

.live-protocol-grid dt,
.live-protocol-grid small,
.action-guard-panel small,
.wallet-connect-panel small {
  color: var(--faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
}

.live-protocol-grid dd {
  margin: 6px 0 0;
  font-size: 1rem;
  font-weight: 800;
}

.wallet-connect-panel {
  margin-top: auto;
  display: grid;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 12px;
}

.wallet-connect-row,
.action-guard-panel {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-guard-panel {
  margin-top: 12px;
  align-items: flex-start;
}

.action-guard-panel p {
  margin: 0;
  color: var(--muted);
}
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Expected: all commands pass.

- [ ] **Step 3: Run browser QA**

Start or reuse the local dev server:

```bash
pnpm --filter @gacha/web dev -- --port 64920
```

Check these routes in desktop and mobile widths:

- `http://localhost:64920/`
- `http://localhost:64920/vault`
- `http://localhost:64920/market`
- `http://localhost:64920/forge`
- `http://localhost:64920/redemption`
- `http://localhost:64920/admin/inventory`

Expected:

- No blank screens.
- No text overlap.
- Status rail shows `testnet`, `46630`, and `ready` when `.env.local` contains the registry.
- Wallet panel does not request accounts on load.
- Guarded actions clearly say transaction submission is Phase 4B.

- [ ] **Step 4: Commit polish**

```bash
git add apps/web/src/app/globals.css apps/web/src/components/__tests__/dashboard.test.tsx
git commit -m "style: polish live testnet surfaces"
```

## Final Gate

Before opening or updating a PR:

```bash
git status --short
pnpm --filter @gacha/web test
pnpm --filter @gacha/contracts test
pnpm -r typecheck
pnpm --filter @gacha/web build
```

Then push:

```bash
git push -u origin codex/phase-4-live-contracts
```

Open a ready PR against `main` titled `Phase 4 live contract foundation`.
