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
              <h1 id="redemption-title">Redemption Desk</h1>
            </div>
            <span className="chain-pill">Token escrow + shipping</span>
          </div>
          <p>
            Move a redeemable vault token through requested, approved, packed, shipped, and completed custody states.
            Completion removes that collectible from Vault Ascension eligibility.
          </p>
        </section>
        <RedemptionTimeline />
      </main>
    </AppShell>
  );
}
