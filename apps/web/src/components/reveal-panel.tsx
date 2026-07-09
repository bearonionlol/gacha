import { ArrowUpRight, Archive, BadgeCheck, HandCoins, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { revealPreview } from "../lib/game-state";
import { PackRevealPanel } from "./testnet-write-panels";

const actionIcons: Record<string, typeof Archive> = {
  "Keep in vault": Archive,
  "List on market": ArrowUpRight,
  "Accept buyback": HandCoins,
  "Request redemption": BadgeCheck,
  "Use in Forge": RefreshCw
};

const actionLinks: Record<string, string> = {
  "Keep in vault": "/vault",
  "List on market": "/market",
  "Accept buyback": "/market",
  "Request redemption": "/redemption",
  "Use in Forge": "/forge"
};

export function RevealPanel({ purchaseId = null }: { purchaseId?: bigint | null }) {
  return (
    <section className="panel reveal-panel" aria-labelledby="reveal-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Reveal station</span>
          <h2 id="reveal-title">{revealPreview.title}</h2>
        </div>
        <Sparkles size={18} aria-hidden="true" />
      </div>
      <p>Reveal the purchase on testnet, then route the physical pull into custody, market, redemption, or Forge.</p>
      <div className="action-grid" aria-label="Reveal next actions">
        {revealPreview.nextActions.map((action) => {
          const Icon = actionIcons[action] ?? Archive;

          return (
            <Link key={action} href={actionLinks[action] ?? "/vault"} className="secondary-action">
              <Icon size={16} aria-hidden="true" />
              {action}
            </Link>
          );
        })}
      </div>
      <PackRevealPanel initialPurchaseId={purchaseId} />
      <p className="disclosure">Reveal operations submit live testnet writes only after explicit wallet confirmation.</p>
    </section>
  );
}
