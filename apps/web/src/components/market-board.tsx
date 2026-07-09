import { BadgeDollarSign, HandCoins, LockKeyhole, PercentCircle, Store } from "lucide-react";
import { formatCents } from "../lib/format";
import { marketListings } from "../lib/game-state";

const marketplaceDisclosure =
  "Listings are escrowed until sale or cancellation. Seller proceeds are net of protocol fee.";

export function MarketBoard() {
  return (
    <section className="portfolio-section" aria-labelledby="market-board-title">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Listing board</span>
          <h2 id="market-board-title">Inventory-backed asks</h2>
        </div>
        <span className="chain-pill">Demo escrow model</span>
      </div>

      <p className="disclosure">{marketplaceDisclosure}</p>

      <div className="market-listings">
        {marketListings.map((listing) => (
          <article className="listing-card" key={listing.id}>
            <div className="panel-header compact">
              <div>
                <span className="eyebrow">Seller / {listing.seller}</span>
                <h3>{listing.title}</h3>
              </div>
              <Store size={18} aria-hidden="true" />
            </div>

            <dl className="detail-grid">
              <div>
                <dt>
                  <BadgeDollarSign size={14} aria-hidden="true" />
                  Ask
                </dt>
                <dd>{formatCents(listing.askCents)}</dd>
              </div>
              <div>
                <dt>
                  <HandCoins size={14} aria-hidden="true" />
                  Buyback
                </dt>
                <dd>{formatCents(listing.buybackCents)}</dd>
              </div>
              <div>
                <dt>
                  <PercentCircle size={14} aria-hidden="true" />
                  Fee bps
                </dt>
                <dd>{listing.feeBps} bps</dd>
              </div>
              <div>
                <dt>
                  <LockKeyhole size={14} aria-hidden="true" />
                  Escrow
                </dt>
                <dd>Until sale/cancel</dd>
              </div>
            </dl>

            <p>{listing.escrowDisclosure}</p>
            <button
              aria-label={`Open listing for ${listing.title}`}
              className="secondary-action"
              disabled
              type="button"
            >
              Open listing
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
