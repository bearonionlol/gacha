import { AppShell } from "../../components/app-shell";
import { MarketBoard } from "../../components/market-board";

export default function MarketPage() {
  return (
    <AppShell activePath="/market">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="market-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Peer-to-peer marketplace</span>
              <h1 id="market-title">Vault Market</h1>
            </div>
            <span className="chain-pill">Fees visible</span>
          </div>
          <p>
            Compare vault-backed listings by price, buyback floor, Forge Tier, and trade-in eligibility. Market escrow
            never changes a card's disclosed tier or grants hidden Forge advantages.
          </p>
        </section>
        <MarketBoard />
      </main>
    </AppShell>
  );
}
