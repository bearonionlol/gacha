import { CheckCircle2, Clock3, PackageCheck, Truck } from "lucide-react";
import { redemptionRequests } from "../lib/game-state";

const lifecycleStates = ["requested", "reviewing", "quoted", "fulfilled"];

const stepIcons: Record<string, typeof Clock3> = {
  requested: Clock3,
  reviewing: PackageCheck,
  quoted: Truck,
  fulfilled: CheckCircle2
};

export function RedemptionTimeline() {
  return (
    <section className="portfolio-section" aria-labelledby="redemption-timeline-title">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Physical delivery</span>
          <h2 id="redemption-timeline-title">Lifecycle states</h2>
        </div>
        <span className="chain-pill">Modeled fulfillment</span>
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
              Opened on {new Date(request.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              . Completion remains modeled until off-chain shipping terms are connected.
            </p>
            <ol className="request-steps">
              {request.steps.map((step) => (
                <li key={step}>{step === "Requested" ? "Request opened" : step}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
