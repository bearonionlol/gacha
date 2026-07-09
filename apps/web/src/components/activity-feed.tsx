import { Clock3 } from "lucide-react";
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
            <p>{entry.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
