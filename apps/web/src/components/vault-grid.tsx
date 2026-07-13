import Link from "next/link";
import { BadgeCheck, Gem, Hammer, PackageCheck, ShieldCheck, Store, Tags, Trophy } from "lucide-react";
import { buildCollectionProgression } from "../lib/collection-progression";
import { formatCents } from "../lib/format";
import { collectibleCards, vaultStats } from "../lib/inventory";
import { loadChainContextFromEnv } from "../lib/deployments";

export function VaultGrid() {
  const progression = buildCollectionProgression(collectibleCards);
  const chainContext = loadChainContextFromEnv();

  return (
    <section className="portfolio-section" aria-labelledby="vault-grid-title">
      <div className="portfolio-summary" aria-label="Vault summary">
        <div>
          <span className="eyebrow">Estimated value</span>
          <strong>{formatCents(vaultStats.marketValueCents)}</strong>
        </div>
        <div>
          <span className="eyebrow">Buyback floor</span>
          <strong>{formatCents(vaultStats.buybackValueCents)}</strong>
        </div>
        <div>
          <span className="eyebrow">Forge pool ready</span>
          <strong>{vaultStats.tierPoolEligibleCount} items</strong>
        </div>
        <div>
          <span className="eyebrow">Trade-in eligible</span>
          <strong>
            {vaultStats.tradeInEligibleCount} {vaultStats.tradeInEligibleCount === 1 ? "item" : "items"}
          </strong>
        </div>
      </div>

      <section className="collection-progress-panel" aria-labelledby="collection-progress-title">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">{progression.albumTitle}</span>
            <h2 id="collection-progress-title">Album progress</h2>
          </div>
          <Trophy size={18} aria-hidden="true" />
        </div>
        <div className="collection-progress-grid">
          {progression.sets.map((set) => (
            <article className="collection-set-card" key={set.id}>
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">{set.rewardLabel}</span>
                  <h3>{set.title}</h3>
                </div>
                <strong>{set.percentComplete}%</strong>
              </div>
              <div
                aria-label={`${set.title} collection progress`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={set.percentComplete}
                className="progress-track"
                role="progressbar"
              >
                <span style={{ width: `${set.percentComplete}%` }} />
              </div>
              <p>
                {set.ownedCount} of {set.totalCount} tags matched
              </p>
            </article>
          ))}
        </div>
        <div className="next-chase-panel">
          <div>
            <span className="eyebrow">Next chase</span>
            <strong>{progression.nextChase.title}</strong>
            <p>{progression.nextChase.nextBestAction}</p>
          </div>
          <div className="tag-row" aria-label="Collection milestones">
            {progression.milestones.map((milestone) => (
              <span key={milestone}>{milestone}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Custody records</span>
          <h2 id="vault-grid-title">Collectible positions</h2>
        </div>
        <span className="chain-pill">
          {chainContext.isDemo ? `${vaultStats.totalItems} illustrative items` : `${vaultStats.totalItems} collection previews`}
        </span>
      </div>

      <p className="disclosure">
        {chainContext.isDemo ? "Demo inventory is illustrative and does not represent wallet ownership. " : "Collection previews are not a substitute for the connected wallet and custody record. "}
        {collectibleCards[0]?.legalDisclaimer} Estimates are informational and do not guarantee a sale price.
      </p>

      <div className="vault-grid">
        {collectibleCards.map((card) => (
          <article className="collectible-card" key={card.id}>
            <div className="photo-hash-cue" aria-label={`Photo hash ${card.photoHash}`}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Photo hash verified</span>
              <code>{card.photoHash.slice(0, 18)}...</code>
            </div>

            <div className="card-copy">
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">
                    {card.brandLabel} / {card.categoryLabel}
                  </span>
                  <h3>{card.title}</h3>
                </div>
                <span className="card-tier-stack">
                  <span className="tier-pill forge-tier-pill">
                    <Hammer size={14} aria-hidden="true" />
                    Forge Tier {card.forgeTier}
                  </span>
                  <span className="grail-label">
                    <Gem size={13} aria-hidden="true" />
                    {card.grailTier} grail class
                  </span>
                </span>
              </div>
              <p>{card.subtitle}</p>
            </div>

            <dl className="detail-grid">
              <div>
                <dt>Estimate</dt>
                <dd>{formatCents(card.estimateCents)}</dd>
              </div>
              <div>
                <dt>Buyback</dt>
                <dd>{formatCents(card.buybackCents)}</dd>
              </div>
              <div>
                <dt>Redeemability</dt>
                <dd>{card.redeemable ? "Redeemable" : "Vault hold"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <BadgeCheck size={14} aria-hidden="true" />
                  Descriptor checked
                </dd>
              </div>
              <div>
                <dt>Forge role</dt>
                <dd>{card.tradeInEligible ? "Eligible trade-in input" : "Anchor candidate"}</dd>
              </div>
              <div>
                <dt>Tier pool</dt>
                <dd>{card.tierPoolEligible ? "Eligible" : "Excluded"}</dd>
              </div>
            </dl>

            <div className="tag-row" aria-label={`${card.title} tags`}>
              <Tags size={14} aria-hidden="true" />
              {card.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="vault-card-actions">
              <Link className="secondary-action" href="/forge">
                <Hammer size={16} aria-hidden="true" />
                {card.tradeInEligible ? "Use as trade-in" : "Use as Anchor"}
              </Link>
              <Link className="secondary-action" href="/market">
                <Store size={16} aria-hidden="true" />
                Market options
              </Link>
              <Link className="secondary-action" href="/redemption">
                <PackageCheck size={16} aria-hidden="true" />
                Redeem options
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
