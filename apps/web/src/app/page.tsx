import { ActivityFeed } from "../components/activity-feed";
import { AppShell } from "../components/app-shell";
import { ArcadePanel } from "../components/arcade-panel";
import { DropLobby } from "../components/drop-lobby";
import { LiveProtocolPanel } from "../components/live-protocol-panel";
import { RevealPanel } from "../components/reveal-panel";
import { StatusRail } from "../components/status-rail";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const liveProtocolPanel = await LiveProtocolPanel();

  return (
    <AppShell>
      <main className="command-center">
        <StatusRail />
        {liveProtocolPanel}
        <div className="dashboard-grid">
          <DropLobby />
          <RevealPanel />
          <ArcadePanel />
          <ActivityFeed />
        </div>
      </main>
    </AppShell>
  );
}
