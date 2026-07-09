import { ArrowUpRight, Archive, BadgeCheck, HandCoins, RefreshCw, Sparkles } from "lucide-react";
import { revealPreview } from "../lib/game-state";

const actionIcons: Record<string, typeof Archive> = {
  "Keep in vault": Archive,
  "List on market": ArrowUpRight,
  "Accept buyback": HandCoins,
  "Request redemption": BadgeCheck,
  "Use in Forge": RefreshCw
};

export function RevealPanel() {
  return (
    <section className="panel reveal-panel" aria-labelledby="reveal-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Reveal preview</span>
          <h2 id="reveal-title">{revealPreview.title}</h2>
        </div>
        <Sparkles size={18} aria-hidden="true" />
      </div>
      <p>
        Ready state mirrors the protocol decision flow after a pack reveal. Choose a next action without submitting a
        chain write in demo mode.
      </p>
      <div className="action-grid" aria-label="Reveal next actions">
        {revealPreview.nextActions.map((action) => {
          const Icon = actionIcons[action] ?? Archive;

          return (
            <button key={action} type="button" className="secondary-action">
              <Icon size={16} aria-hidden="true" />
              {action}
            </button>
          );
        })}
      </div>
      <p className="disclosure">Reveal actions are preview-only until protocol writes are connected.</p>
    </section>
  );
}
