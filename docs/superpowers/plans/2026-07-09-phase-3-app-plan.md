# Phase 3 Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-testnet-ready web app for the gacha super app: a premium Robinhood-inspired command center with drops, reveal actions, vault, marketplace, Forge, redemption, admin inventory, Signal Run arcade, and deployment-mode awareness.

**Architecture:** Add `apps/web` as a Next.js App Router package inside the existing pnpm monorepo. Keep blockchain writes out of Phase 3; use pure domain adapters that read `@gacha/inventory` and `@gacha/shared`, expose a deployment registry status, and make every route work in demo mode until Robinhood testnet deployment writes `deployments/robinhoodTestnet.json`.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, jsdom, lucide-react, pnpm workspaces, existing `@gacha/inventory` and `@gacha/shared` packages.

---

## Source Spec

Implement against `docs/superpowers/specs/2026-07-09-phase-3-app-design.md`.

Important product constraints:

- First screen is the app experience, not a landing page.
- Real resale inventory descriptors are allowed; no official affiliation or endorsement language.
- Signal Run arcade XP/streaks never change pull odds or guarantee item value.
- No fantasy stock arena, real wallet writes, indexer, mainnet deployment, or fulfillment backend in this phase.
- Visual direction is premium, welcoming, finance-grade, Robinhood-inspired green accents, graphite surfaces, and subtle hacker status details.

## File Structure

Create and modify these files:

- Modify `pnpm-workspace.yaml`: add `apps/*`.
- Modify `package.json`: add a root `build` script that runs workspace builds.
- Modify `.env.example`: add web-facing network/deployment variables.
- Create `apps/web/package.json`: package scripts and dependencies.
- Create `apps/web/tsconfig.json`: Next-compatible TypeScript config.
- Create `apps/web/next.config.mjs`: strict Next config.
- Create `apps/web/vitest.config.ts`: jsdom test config.
- Create `apps/web/src/test/setup.ts`: Testing Library matcher setup.
- Create `apps/web/src/app/layout.tsx`: root layout and metadata.
- Create `apps/web/src/app/globals.css`: full visual system.
- Create `apps/web/src/app/page.tsx`: command center dashboard.
- Create `apps/web/src/app/vault/page.tsx`: vault portfolio.
- Create `apps/web/src/app/market/page.tsx`: fixed-price market.
- Create `apps/web/src/app/forge/page.tsx`: Forge workbench.
- Create `apps/web/src/app/redemption/page.tsx`: redemption lifecycle.
- Create `apps/web/src/app/admin/inventory/page.tsx`: admin intake console.
- Create `apps/web/src/components/app-shell.tsx`: shared shell and navigation.
- Create `apps/web/src/components/status-rail.tsx`: chain/deployment status.
- Create `apps/web/src/components/drop-lobby.tsx`: pack drop summary and odds.
- Create `apps/web/src/components/reveal-panel.tsx`: reveal result and next actions.
- Create `apps/web/src/components/arcade-panel.tsx`: Signal Run arcade preview.
- Create `apps/web/src/components/activity-feed.tsx`: recent system events.
- Create `apps/web/src/components/vault-grid.tsx`: collectible portfolio grid.
- Create `apps/web/src/components/market-board.tsx`: listing board.
- Create `apps/web/src/components/redemption-timeline.tsx`: redemption states.
- Create `apps/web/src/components/forge-workbench.tsx`: recipe book and crafting grid.
- Create `apps/web/src/components/admin-inventory-console.tsx`: admin lifecycle/export UI.
- Create `apps/web/src/lib/format.ts`: formatting helpers.
- Create `apps/web/src/lib/inventory.ts`: inventory display view-models.
- Create `apps/web/src/lib/deployments.ts`: deployment registry status resolver.
- Create `apps/web/src/lib/game-state.ts`: deterministic app state.
- Create `apps/web/src/lib/arcade.ts`: Signal Run state and copy.
- Create `apps/web/src/lib/__tests__/*.test.ts`: domain tests.
- Create `apps/web/src/components/__tests__/*.test.tsx`: component tests.

## Task 1: Scaffold Web Workspace And Smoke Test

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `.env.example`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/app/__tests__/smoke.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `apps/web/src/app/__tests__/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "../page";

describe("Phase 3 app smoke", () => {
  it("renders the command center as the first screen", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: /Drop Command/i })).toBeInTheDocument();
    expect(screen.getByText(/Robinhood Chain Testnet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- smoke
```

Expected: command fails because `@gacha/web` and the route do not exist.

- [ ] **Step 3: Add the workspace package and minimal page**

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Add root script to `package.json`:

```json
"build": "pnpm -r build"
```

Append to `.env.example`:

```dotenv
NEXT_PUBLIC_GACHA_CHAIN_MODE=testnet
NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY=demo
NEXT_PUBLIC_GACHA_ENABLE_ADMIN=true
```

Create `apps/web/package.json`:

```json
{
  "name": "@gacha/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@gacha/inventory": "workspace:*",
    "@gacha/shared": "workspace:*",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.1"
  }
}
```

Create the config files and a minimal `HomePage` that renders `Drop Command` and `Robinhood Chain Testnet`.

- [ ] **Step 4: Install dependencies and verify GREEN**

Run:

```bash
pnpm install
pnpm --filter @gacha/web test -- smoke
```

Expected: test passes.

- [ ] **Step 5: Commit scaffold**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .env.example apps/web
git commit -m "feat: scaffold web app"
```

## Task 2: Add Domain Adapters And Deterministic Game State

**Files:**

- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/lib/inventory.ts`
- Create: `apps/web/src/lib/deployments.ts`
- Create: `apps/web/src/lib/game-state.ts`
- Create: `apps/web/src/lib/arcade.ts`
- Test: `apps/web/src/lib/__tests__/app-state.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `apps/web/src/lib/__tests__/app-state.test.ts`:

```ts
import { signalRun } from "../arcade";
import { resolveDeploymentStatus } from "../deployments";
import { activeDrop, marketListings } from "../game-state";
import { collectibleCards, vaultStats } from "../inventory";

describe("Phase 3 app state", () => {
  it("maps sample inventory into collectible cards and vault stats", () => {
    expect(collectibleCards.map((card) => card.title)).toContain("Pokemon TCG Charizard ex");
    expect(vaultStats.totalItems).toBeGreaterThanOrEqual(3);
    expect(vaultStats.marketValueCents).toBeGreaterThan(0);
  });

  it("uses demo deployment status when no registry is present", () => {
    const status = resolveDeploymentStatus(null);

    expect(status.mode).toBe("demo");
    expect(status.chainName).toBe("Robinhood Chain Testnet");
    expect(status.message).toMatch(/demo mode/i);
  });

  it("parses a valid deployment registry snapshot", () => {
    const status = resolveDeploymentStatus({
      network: "robinhoodTestnet",
      chainId: 46630,
      deployedAt: "2026-07-09T00:00:00.000Z",
      contracts: {
        ItemToken: "0x0000000000000000000000000000000000000001",
        Marketplace: "0x0000000000000000000000000000000000000002"
      }
    });

    expect(status.mode).toBe("testnet");
    expect(status.contracts).toHaveLength(2);
  });

  it("keeps Signal Run separate from pull odds", () => {
    expect(signalRun.disclosure).toMatch(/does not change pull odds/i);
    expect(signalRun.recipeProgressPercent).toBeGreaterThan(0);
  });

  it("creates market listings from inventory-backed cards", () => {
    expect(marketListings[0]?.seller).toMatch(/vault/i);
    expect(activeDrop.odds.some((row) => row.label === "Physical grail")).toBe(true);
  });
});
```

- [ ] **Step 2: Run domain tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- app-state
```

Expected: test fails because the lib modules do not exist.

- [ ] **Step 3: Implement domain adapters**

Implement pure modules with these exports:

```ts
// format.ts
export const formatCents = (value: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
export const formatCompactNumber = (value: number): string => new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
export const shortenAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
```

```ts
// deployments.ts
export type DeploymentRegistrySnapshot = {
  network: string;
  chainId: number;
  deployedAt?: string;
  contracts?: Record<string, string>;
};

export type DeploymentStatus = {
  mode: "demo" | "testnet" | "mainnet";
  chainName: string;
  chainId: number;
  message: string;
  contracts: { name: string; address: string }[];
};

export function resolveDeploymentStatus(snapshot: DeploymentRegistrySnapshot | null): DeploymentStatus;
```

```ts
// inventory.ts
export type CollectibleCard = {
  id: string;
  title: string;
  brandLabel: string;
  categoryLabel: string;
  subtitle: string;
  estimateCents: number;
  buybackCents: number;
  grailTier: string;
  redeemable: boolean;
  tags: string[];
  legalDisclaimer: string;
  photoHash: string;
};

export const collectibleCards: CollectibleCard[];
export const vaultStats: { totalItems: number; marketValueCents: number; buybackValueCents: number; grailCount: number };
```

```ts
// arcade.ts
export const signalRun = {
  title: "Signal Run",
  streak: 7,
  xp: 1840,
  recipeProgressPercent: 64,
  disclosure: "Signal Run XP and streaks do not change pull odds or guarantee item value."
};
```

```ts
// game-state.ts
export const activeDrop;
export const revealPreview;
export const marketListings;
export const forgeRecipes;
export const redemptionRequests;
export const activityFeed;
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @gacha/web test -- app-state
```

Expected: tests pass.

- [ ] **Step 5: Commit domain adapters**

```bash
git add apps/web/src/lib
git commit -m "feat: add web app state adapters"
```

## Task 3: Build App Shell, Dashboard, Reveal, And Signal Run

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/status-rail.tsx`
- Create: `apps/web/src/components/drop-lobby.tsx`
- Create: `apps/web/src/components/reveal-panel.tsx`
- Create: `apps/web/src/components/arcade-panel.tsx`
- Create: `apps/web/src/components/activity-feed.tsx`
- Test: `apps/web/src/components/__tests__/dashboard.test.tsx`
- Test: `apps/web/src/components/__tests__/navigation.test.tsx`

- [ ] **Step 1: Write failing dashboard and navigation tests**

Create `dashboard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "../../app/page";

describe("dashboard", () => {
  it("shows odds, randomness disclosure, and reveal next actions", () => {
    render(<HomePage />);

    expect(screen.getByText(/Physical grail/i)).toBeInTheDocument();
    expect(screen.getByText(/operator-controlled testnet randomness/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Keep in vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /List on market/i })).toBeInTheDocument();
  });

  it("shows Signal Run without promising better odds", () => {
    render(<HomePage />);

    expect(screen.getByText(/Signal Run/i)).toBeInTheDocument();
    expect(screen.getByText(/does not change pull odds/i)).toBeInTheDocument();
  });
});
```

Create `navigation.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { AppShell } from "../app-shell";

describe("app navigation", () => {
  it("exposes every core route", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>
    );

    for (const label of ["Command", "Vault", "Market", "Forge", "Redemption", "Admin"]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- dashboard navigation
```

Expected: tests fail because components and full page content do not exist.

- [ ] **Step 3: Implement shell and dashboard components**

Create components with accessible headings, links, and buttons:

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Primary navigation">...</aside>
      <section className="workspace">{children}</section>
    </div>
  );
}
```

```tsx
export function DropLobby() {
  return (
    <section className="panel drop-lobby" aria-labelledby="drop-lobby-heading">
      <h2 id="drop-lobby-heading">Genesis Vault Drop</h2>
      ...
    </section>
  );
}
```

```tsx
export function ArcadePanel() {
  return (
    <section className="panel arcade-panel" aria-labelledby="signal-run-heading">
      <h2 id="signal-run-heading">Signal Run</h2>
      <p>{signalRun.disclosure}</p>
      ...
    </section>
  );
}
```

Use `lucide-react` icons for navigation and actions. Keep route content dense and responsive; avoid marketing hero copy.

- [ ] **Step 4: Verify dashboard GREEN**

Run:

```bash
pnpm --filter @gacha/web test -- dashboard navigation smoke
```

Expected: tests pass.

- [ ] **Step 5: Commit dashboard**

```bash
git add apps/web/src/app apps/web/src/components
git commit -m "feat: add phase 3 command dashboard"
```

## Task 4: Build Vault, Market, And Redemption Routes

**Files:**

- Create: `apps/web/src/app/vault/page.tsx`
- Create: `apps/web/src/app/market/page.tsx`
- Create: `apps/web/src/app/redemption/page.tsx`
- Create: `apps/web/src/components/vault-grid.tsx`
- Create: `apps/web/src/components/market-board.tsx`
- Create: `apps/web/src/components/redemption-timeline.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/__tests__/vault-market-redemption.test.tsx`

- [ ] **Step 1: Write failing route tests**

Create `vault-market-redemption.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import MarketPage from "../../app/market/page";
import RedemptionPage from "../../app/redemption/page";
import VaultPage from "../../app/vault/page";

describe("vault, market, and redemption routes", () => {
  it("renders resale inventory descriptors and brand disclaimers in the vault", () => {
    render(<VaultPage />);

    expect(screen.getByText(/Pokemon TCG Charizard ex/i)).toBeInTheDocument();
    expect(screen.getByText(/Authentic resale collectible descriptor/i)).toBeInTheDocument();
    expect(screen.getByText(/no affiliation or endorsement/i)).toBeInTheDocument();
  });

  it("renders marketplace fees and escrow disclosure", () => {
    render(<MarketPage />);

    expect(screen.getByText(/Fixed-price market/i)).toBeInTheDocument();
    expect(screen.getByText(/escrowed until sale or cancellation/i)).toBeInTheDocument();
    expect(screen.getByText(/protocol fee/i)).toBeInTheDocument();
  });

  it("renders redemption lifecycle states", () => {
    render(<RedemptionPage />);

    expect(screen.getByText(/Redemption Desk/i)).toBeInTheDocument();
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
    expect(screen.getByText(/fulfilled/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- vault-market-redemption
```

Expected: tests fail because routes and components do not exist.

- [ ] **Step 3: Implement the routes**

Each page wraps content in `AppShell`. The vault uses `collectibleCards`, the market uses `marketListings`, and redemption uses `redemptionRequests`.

Use these section headings:

```tsx
<h1>Vault Portfolio</h1>
<h1>Fixed-price market</h1>
<h1>Redemption Desk</h1>
```

Required copy:

```tsx
<p>Listings are escrowed until sale or cancellation. Seller proceeds are net of protocol fee.</p>
<p>Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.</p>
```

- [ ] **Step 4: Verify route GREEN**

Run:

```bash
pnpm --filter @gacha/web test -- vault-market-redemption
```

Expected: tests pass.

- [ ] **Step 5: Commit routes**

```bash
git add apps/web/src/app apps/web/src/components
git commit -m "feat: add vault market and redemption routes"
```

## Task 5: Build Forge And Admin Inventory Console

**Files:**

- Create: `apps/web/src/app/forge/page.tsx`
- Create: `apps/web/src/app/admin/inventory/page.tsx`
- Create: `apps/web/src/components/forge-workbench.tsx`
- Create: `apps/web/src/components/admin-inventory-console.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/__tests__/forge-admin.test.tsx`

- [ ] **Step 1: Write failing Forge/admin tests**

Create `forge-admin.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import AdminInventoryPage from "../../app/admin/inventory/page";
import ForgePage from "../../app/forge/page";

describe("forge and admin routes", () => {
  it("renders recipe book, crafting grid, output preview, and grail protection", () => {
    render(<ForgePage />);

    expect(screen.getByText(/Recipe Book/i)).toBeInTheDocument();
    expect(screen.getByText(/3 x 3 Forge Grid/i)).toBeInTheDocument();
    expect(screen.getByText(/Output Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/grail-protected/i)).toBeInTheDocument();
  });

  it("renders admin lifecycle, required fields, and export controls", () => {
    render(<AdminInventoryPage />);

    expect(screen.getByText(/Inventory Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/inventoryId/i)).toBeInTheDocument();
    expect(screen.getByText(/custodyStatus/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @gacha/web test -- forge-admin
```

Expected: tests fail because routes and components do not exist.

- [ ] **Step 3: Implement Forge and admin UI**

Forge requirements:

- Render recipe cards from `forgeRecipes`.
- Render nine fixed-size grid slots.
- Render ingredient tray from `collectibleCards`.
- Mark grail inputs as protected by default.
- Render output preview and recipe cap/fee copy.

Admin requirements:

- Render a table-like intake console from sample inventory.
- Show required fields: `inventoryId`, `brand`, `category`, `photoHash`, `custodyStatus`, `marketEstimateCents`, `buybackQuoteCents`.
- Render lifecycle states from existing inventory package naming.
- Render disabled `Export JSON` and `Export CSV` buttons with copy that exports are wired to inventory helpers in the next persistence pass.

- [ ] **Step 4: Verify Forge/admin GREEN**

Run:

```bash
pnpm --filter @gacha/web test -- forge-admin
```

Expected: tests pass.

- [ ] **Step 5: Commit Forge and admin**

```bash
git add apps/web/src/app apps/web/src/components
git commit -m "feat: add forge and admin app routes"
```

## Task 6: Production Polish, Typecheck, Build, Browser QA, And PR Prep

**Files:**

- Modify: `README.md`
- Modify: `docs/testnet-runbook.md`
- Modify: `apps/web/src/app/globals.css`
- Modify: any app files needed to fix verification findings.

- [ ] **Step 1: Run full web tests**

Run:

```bash
pnpm --filter @gacha/web test
```

Expected: all web tests pass.

- [ ] **Step 2: Run TypeScript checks**

Run:

```bash
pnpm --filter @gacha/web typecheck
pnpm -r typecheck
```

Expected: both commands pass.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm --filter @gacha/web build
```

Expected: build passes without route errors.

- [ ] **Step 4: Start local server and run browser QA**

Run:

```bash
pnpm --filter @gacha/web dev -- --port 64920
```

Open `http://localhost:64920/` in the in-app browser and capture desktop/mobile screenshots.

Visual checks:

- Dashboard, vault, market, forge, redemption, and admin routes render.
- Text does not overlap at desktop or mobile widths.
- App is the first screen; no marketing landing page appears.
- Premium visual system reads as black/off-white/graphite with precise green accents.
- Signal Run disclaimer is visible.
- Brand resale/no-affiliation disclaimer is visible.
- No broken external product images are visible.

- [ ] **Step 5: Update docs**

Add `apps/web` setup to `README.md` and add a Phase 3 UI QA note to `docs/testnet-runbook.md`:

```bash
pnpm --filter @gacha/web dev
pnpm --filter @gacha/web build
```

- [ ] **Step 6: Commit polish**

```bash
git add README.md docs/testnet-runbook.md apps/web
git commit -m "docs: add phase 3 web app runbook"
```

- [ ] **Step 7: Final verification before PR**

Run:

```bash
pnpm --filter @gacha/web test
pnpm --filter @gacha/web typecheck
pnpm --filter @gacha/web build
pnpm -r typecheck
git status -sb
```

Expected: commands pass and the branch is clean except for intentional uncommitted dev-server artifacts, if any.

## Self-Review Checklist

- Spec coverage: every Phase 3 route and safety cue has an implementation task.
- No placeholder app screens: every route renders production-style UI using real sample inventory or deterministic app state.
- Type consistency: `CollectibleCard`, `DeploymentStatus`, `activeDrop`, `marketListings`, `forgeRecipes`, and `signalRun` names are defined before component tasks use them.
- Compliance: Signal Run copy states that XP/streaks do not change pull odds; resale disclaimers avoid official affiliation claims.
- Test coverage: domain adapters, shell navigation, dashboard, Signal Run, vault, marketplace, redemption, Forge, and admin all have focused tests.
