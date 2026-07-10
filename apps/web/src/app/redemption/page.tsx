import { AppShell } from "../../components/app-shell";
import { RedemptionTimeline } from "../../components/redemption-timeline";

export default function RedemptionPage() {
  return (
    <AppShell activePath="/redemption">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="redemption-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Physical fulfillment</span>
              <h1 id="redemption-title">Physical Redemption</h1>
            </div>
            <span className="chain-pill">Tracked custody</span>
          </div>
          <p>
            Exchange an eligible vault token for its physical collectible and follow each custody step from request to
            delivery. Review shipping requirements before placing the token in redemption escrow.
          </p>
        </section>
        <RedemptionTimeline />
      </main>
    </AppShell>
  );
}
