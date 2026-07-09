import { ActivityFeed } from "../components/activity-feed";
import { AppShell } from "../components/app-shell";
import { ArcadePanel } from "../components/arcade-panel";
import { DropLobby } from "../components/drop-lobby";
import { RevealPanel } from "../components/reveal-panel";
import { StatusRail } from "../components/status-rail";

export default function HomePage() {
  return (
    <AppShell>
      <main className="command-center">
        <StatusRail />
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
