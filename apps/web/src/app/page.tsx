import { ActivityFeed } from "../components/activity-feed";
import { AppShell } from "../components/app-shell";
import { ArcadePanel } from "../components/arcade-panel";
import { EconomyPanel } from "../components/economy-panel";
import { GachaMachine } from "../components/gacha-machine";
import { LiveProtocolPanel } from "../components/live-protocol-panel";
import { StatusRail } from "../components/status-rail";

export const dynamic = "force-dynamic";

export default async function GachaPage() {
  const liveProtocolPanel = await LiveProtocolPanel();

  return (
    <AppShell activePath="/">
      <main className="command-center gacha-page">
        <GachaMachine />
        <div className="gacha-support-grid">
          <ArcadePanel />
          <ActivityFeed />
        </div>
        <section className="gacha-transparency" aria-labelledby="gacha-transparency-title">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Testnet transparency</span>
              <h2 id="gacha-transparency-title">Network and protocol</h2>
            </div>
            <span className="chain-pill">Read before mainnet</span>
          </div>
          <StatusRail />
          {liveProtocolPanel}
          <EconomyPanel />
        </section>
      </main>
    </AppShell>
  );
}
