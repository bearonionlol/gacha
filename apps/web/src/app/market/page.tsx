import { AppShell } from "../../components/app-shell";
import { MarketBoard } from "../../components/market-board";

export default function MarketPage() {
  return (
    <AppShell activePath="/market">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="market-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Peer-to-peer trading</span>
              <h1 id="market-title">Marketplace</h1>
            </div>
            <span className="chain-pill">Fees before signing</span>
          </div>
          <p>
            Compare asks with buyback references, review the protocol fee, and load the exact escrow state before you
            sign. Listed collectibles do not carry guaranteed liquidity or resale value.
          </p>
        </section>
        <MarketBoard />
      </main>
    </AppShell>
  );
}
