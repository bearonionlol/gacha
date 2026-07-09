import { Activity, CheckCircle2, RadioTower } from "lucide-react";
import { resolveDeploymentStatus } from "../lib/deployments";

export function StatusRail() {
  const status = resolveDeploymentStatus(null);

  return (
    <section className="status-rail" aria-labelledby="status-rail-title">
      <div>
        <span className="eyebrow">Network</span>
        <h2 id="status-rail-title">{status.chainName}</h2>
        <p>{status.message}</p>
      </div>
      <dl className="status-metrics">
        <div>
          <dt>
            <RadioTower size={15} aria-hidden="true" />
            Mode
          </dt>
          <dd>{status.mode}</dd>
        </div>
        <div>
          <dt>
            <Activity size={15} aria-hidden="true" />
            Chain ID
          </dt>
          <dd>{status.chainId}</dd>
        </div>
        <div>
          <dt>
            <CheckCircle2 size={15} aria-hidden="true" />
            Readiness
          </dt>
          <dd>{status.readiness}</dd>
        </div>
      </dl>
    </section>
  );
}
