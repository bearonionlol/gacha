import { BadgeDollarSign, HandCoins, LockKeyhole, PercentCircle, Store } from "lucide-react";
import { BuybackPanel, MarketplaceListPanel, MarketplaceTradePanel } from "./testnet-write-panels";
import { formatCents } from "../lib/format";
import { marketListings } from "../lib/game-state";
import { enrichMarketListings } from "../lib/marketplace";

const marketplaceDisclosure =
  "Listings are escrowed until sale or cancellation. Seller proceeds are net of protocol fee.";

export function MarketBoard() {
  const enrichedListings = enrichMarketListings(marketListings);

  return (
    <section className="portfolio-section" aria-labelledby="market-board-title">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Listing board</span>
          <h2 id="market-board-title">Inventory-backed asks</h2>
        </div>
        <span className="chain-pill">Pricing reference</span>
      </div>

      <p className="disclosure">{marketplaceDisclosure}</p>

      <div className="market-listings">
        {enrichedListings.map((listing) => (
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
                  Protocol fee
                </dt>
                <dd>{formatCents(listing.protocolFeeCents)}</dd>
              </div>
              <div>
                <dt>
                  <LockKeyhole size={14} aria-hidden="true" />
                  Escrow
                </dt>
                <dd>Until sale/cancel</dd>
              </div>
              <div>
                <dt>Seller receives</dt>
                <dd>{formatCents(listing.sellerReceivesCents)}</dd>
              </div>
              <div>
                <dt>Floor delta</dt>
                <dd>{formatCents(listing.floorDeltaCents)}</dd>
              </div>
              <div>
                <dt>Buyback delta</dt>
                <dd>{formatCents(listing.buybackDeltaCents)}</dd>
              </div>
              <div>
                <dt>Listing health</dt>
                <dd>{listing.risk.message}</dd>
              </div>
            </dl>

            <p>
              {listing.escrowDisclosure ?? marketplaceDisclosure} Seller receives{" "}
              {formatCents(listing.sellerReceivesCents)} after a {listing.feeBps} bps protocol fee.
            </p>
          </article>
        ))}
      </div>

      <section className="market-operations" aria-labelledby="market-operations-title">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Testnet escrow</span>
            <h2 id="market-operations-title">Market order ticket</h2>
          </div>
          <span className="chain-pill">Live contracts</span>
        </div>
        <div className="market-ops-grid">
          <MarketplaceListPanel inputId="market-token-id" />
          <MarketplaceTradePanel />
        </div>
        <div className="section-heading-row buyback-heading">
          <div>
            <span className="eyebrow">Protocol liquidity</span>
            <h2>Buyback desk</h2>
          </div>
          <span className="chain-pill">Exact quotes</span>
        </div>
        <BuybackPanel />
      </section>
    </section>
  );
}
