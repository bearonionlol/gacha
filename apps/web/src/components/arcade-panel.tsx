import { Gauge, Radio, Zap } from "lucide-react";
import { signalRun } from "../lib/arcade";

export function ArcadePanel() {
  return (
    <section className="panel arcade-panel" aria-labelledby="signal-run-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Daily arcade</span>
          <h2 id="signal-run-title">{signalRun.title}</h2>
        </div>
        <Zap size={18} aria-hidden="true" />
      </div>
      <dl className="arcade-stats">
        <div>
          <dt>
            <Radio size={15} aria-hidden="true" />
            Streak
          </dt>
          <dd>{signalRun.streak} days</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>{signalRun.xp.toLocaleString("en-US")}</dd>
        </div>
      </dl>
      <div className="progress-row" aria-label="Ascension preparation">
        <span>
          <Gauge size={15} aria-hidden="true" />
          Ascension prep
        </span>
        <strong>{signalRun.recipeProgressPercent}%</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${signalRun.recipeProgressPercent}%` }} />
      </div>
      <p className="disclosure">{signalRun.disclosure.replace("Signal Run ", "This route ")}</p>
    </section>
  );
}
