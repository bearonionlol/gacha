import { RadioTower } from "lucide-react";
import { getLiveProtocolSnapshot } from "../lib/contracts/live-state";
import { loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";

export async function LiveProtocolPanel() {
  const snapshot = await getLiveProtocolSnapshot({
    registrySnapshot: loadDeploymentRegistrySnapshotFromEnv()
  });

  return (
    <section className="panel live-protocol-panel" aria-labelledby="live-protocol-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Live protocol</span>
          <h2 id="live-protocol-title">{snapshot.title}</h2>
        </div>
        <span className={`chain-pill protocol-${snapshot.state}`}>
          <RadioTower size={14} aria-hidden="true" />
          {snapshot.state}
        </span>
      </div>
      <p>{snapshot.message}</p>
      {snapshot.metrics.length > 0 ? (
        <dl className="live-protocol-grid">
          {snapshot.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <small>{metric.detail}</small>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
