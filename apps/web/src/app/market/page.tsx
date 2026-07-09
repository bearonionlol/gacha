import { AppShell } from "../../components/app-shell";
import { MarketBoard } from "../../components/market-board";

export default function MarketPage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="market-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Marketplace</span>
              <h1 id="market-title">Fixed-price market</h1>
            </div>
            <span className="chain-pill">Fees visible</span>
          </div>
          <p>
            Browse deterministic demo listings with seller identity, ask price, buyback floor, fee bps, and escrow
            disclosure before protocol writes are connected.
          </p>
        </section>
        <MarketBoard />
      </main>
    </AppShell>
  );
}
