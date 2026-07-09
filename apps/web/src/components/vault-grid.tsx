import { BadgeCheck, Gem, PackageCheck, ShieldCheck, Tags } from "lucide-react";
import { formatCents } from "../lib/format";
import { collectibleCards, vaultStats } from "../lib/inventory";

export function VaultGrid() {
  return (
    <section className="portfolio-section" aria-labelledby="vault-grid-title">
      <div className="portfolio-summary" aria-label="Vault summary">
        <div>
          <span className="eyebrow">Portfolio value</span>
          <strong>{formatCents(vaultStats.marketValueCents)}</strong>
        </div>
        <div>
          <span className="eyebrow">Buyback floor</span>
          <strong>{formatCents(vaultStats.buybackValueCents)}</strong>
        </div>
        <div>
          <span className="eyebrow">Grail tracked</span>
          <strong>{vaultStats.grailCount} items</strong>
        </div>
      </div>

      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Inventory backed</span>
          <h2 id="vault-grid-title">Collectible positions</h2>
        </div>
        <span className="chain-pill">{vaultStats.totalItems} verified samples</span>
      </div>

      <p className="disclosure">{collectibleCards[0]?.legalDisclaimer}</p>

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
                <span className="tier-pill">
                  <Gem size={14} aria-hidden="true" />
                  {card.grailTier}
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
            </dl>

            <div className="tag-row" aria-label={`${card.title} tags`}>
              <Tags size={14} aria-hidden="true" />
              {card.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <button className="secondary-action" type="button">
              <PackageCheck size={16} aria-hidden="true" />
              Review vault item
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
