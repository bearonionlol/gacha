import { ActivityFeed } from "../components/activity-feed";
import { AppShell } from "../components/app-shell";
import { ArcadePanel } from "../components/arcade-panel";
import { DropJourney } from "../components/drop-journey";
import { EconomyPanel } from "../components/economy-panel";
import { LiveProtocolPanel } from "../components/live-protocol-panel";
import { StatusRail } from "../components/status-rail";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const liveProtocolPanel = await LiveProtocolPanel();

  return (
    <AppShell>
      <main className="command-center">
        <StatusRail />
        {liveProtocolPanel}
        <EconomyPanel />
        <div className="dashboard-grid">
          <DropJourney />
          <ArcadePanel />
          <ActivityFeed />
        </div>
      </main>
    </AppShell>
  );
}
