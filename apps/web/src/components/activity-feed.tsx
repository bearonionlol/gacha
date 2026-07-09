import { ArrowUpRight, Clock3 } from "lucide-react";
import { activityFeed } from "../lib/game-state";

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(value));

export function ActivityFeed() {
  return (
    <section className="panel activity-feed" aria-labelledby="activity-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Live tape</span>
          <h2 id="activity-title">Recent activity</h2>
        </div>
        <Clock3 size={18} aria-hidden="true" />
      </div>
      <ol>
        {activityFeed.map((entry) => (
          <li key={entry.id}>
            <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
            <div className="activity-title-row">
              <strong>{entry.label}</strong>
              <span>{entry.source}</span>
            </div>
            <p>{entry.detail}</p>
            <div className="activity-actions">
              <span>{entry.nextAction}</span>
              {entry.txUrl === null ? null : (
                <a href={entry.txUrl} rel="noreferrer" target="_blank">
                  View tx
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
