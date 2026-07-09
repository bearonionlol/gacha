import { AppShell } from "../../components/app-shell";
import { RedemptionTimeline } from "../../components/redemption-timeline";

export default function RedemptionPage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="redemption-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Fulfillment queue</span>
              <h1 id="redemption-title">Redemption Desk</h1>
            </div>
            <span className="chain-pill">Off-chain terms pending</span>
          </div>
          <p>
            Follow physical collectible requests through review, quote handling, and final delivery lifecycle states.
          </p>
        </section>
        <RedemptionTimeline />
      </main>
    </AppShell>
  );
}
