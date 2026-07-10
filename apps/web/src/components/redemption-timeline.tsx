import { BadgeCheck, CheckCircle2, Clock3, Hammer, PackageCheck, Truck } from "lucide-react";
import { RedemptionRequestPanel } from "./testnet-write-panels";
import { redemptionRequests } from "../lib/game-state";

const lifecycleStates = ["requested", "approved", "packed", "shipped", "completed"];

const stepIcons: Record<string, typeof Clock3> = {
  requested: Clock3,
  approved: BadgeCheck,
  packed: PackageCheck,
  shipped: Truck,
  completed: CheckCircle2
};

const formatRequestDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));

export function RedemptionTimeline() {
  return (
    <section className="portfolio-section" aria-labelledby="redemption-timeline-title">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Physical delivery</span>
          <h2 id="redemption-timeline-title">Lifecycle states</h2>
        </div>
        <span className="chain-pill">On-chain lifecycle</span>
      </div>

      <div className="timeline-state-row" aria-label="Redemption lifecycle states">
        {lifecycleStates.map((state) => {
          const Icon = stepIcons[state] ?? Clock3;

          return (
            <div className="timeline-state" key={state}>
              <Icon size={16} aria-hidden="true" />
              <span>{state}</span>
            </div>
          );
        })}
      </div>

      <div className="redemption-forge-note">
        <Hammer size={18} aria-hidden="true" />
        <div>
          <strong>Vault Ascension boundary</strong>
          <p>
            A completed redemption burns the escrowed on-chain claim. The physical card leaves vault custody and can no
            longer serve as an Anchor, trade-in, or tier-pool reward.
          </p>
        </div>
      </div>

      <div className="redemption-requests">
        {redemptionRequests.map((request) => (
          <article className="redemption-card" key={request.id}>
            <div className="panel-header compact">
              <div>
                <span className="eyebrow">Request {request.id}</span>
                <h3>{request.title}</h3>
              </div>
              <span className="tier-pill">{request.status}</span>
            </div>
            <p>
              Opened on {formatRequestDate(request.requestedAt)}. Each custody transition is recorded separately; the
              shipping carrier handoff remains an operator action.
            </p>
            <ol className="request-steps">
              {request.steps.map((step) => (
                <li key={step}>{step === "Requested" ? "Request opened" : step}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
      <RedemptionRequestPanel />
    </section>
  );
}
