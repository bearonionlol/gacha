import { BadgeDollarSign, HandCoins, ReceiptText, ShieldCheck } from "lucide-react";
import { buildProtocolEconomySnapshot } from "../lib/economy";
import { activeDrop, marketListings } from "../lib/game-state";
import { vaultStats } from "../lib/inventory";
import { formatCents } from "../lib/format";

const snapshot = buildProtocolEconomySnapshot({ activeDrop, marketListings, vaultStats });

export function EconomyPanel() {
  return (
    <section className="panel economy-panel" aria-labelledby="economy-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Revenue controls</span>
          <h2 id="economy-title">Protocol economy</h2>
        </div>
        <ReceiptText size={18} aria-hidden="true" />
      </div>
      <p>
        Every paid action shows the expected protocol take, user proceeds, and reserve cushion before a wallet path is
        available.
      </p>

      <dl className="economy-grid">
        <div>
          <dt>
            <BadgeDollarSign size={15} aria-hidden="true" />
            {snapshot.packMargin.title}
          </dt>
          <dd>{formatCents(snapshot.packMargin.grossMarginCents)}</dd>
          <small>{formatCents(snapshot.packMargin.protocolFeeCents)} target protocol fee per pack</small>
        </div>
        <div>
          <dt>
            <ReceiptText size={15} aria-hidden="true" />
            {snapshot.marketFees.title}
          </dt>
          <dd>{snapshot.marketFees.blendedFeeBps} bps</dd>
          <small>{formatCents(snapshot.marketFees.projectedFeeCents)} projected from listed asks</small>
        </div>
        <div>
          <dt>
            <HandCoins size={15} aria-hidden="true" />
            {snapshot.buybackSpread.title}
          </dt>
          <dd>{formatCents(snapshot.buybackSpread.spreadCents)}</dd>
          <small>{snapshot.buybackSpread.spreadBps} bps cushion against vault marks</small>
        </div>
        <div>
          <dt>
            <ShieldCheck size={15} aria-hidden="true" />
            {snapshot.operatorReserve.title}
          </dt>
          <dd>{formatCents(snapshot.operatorReserve.reserveCents)}</dd>
          <small>{snapshot.operatorReserve.reservePercent}% reserve on remaining supply</small>
        </div>
      </dl>

      <p className="disclosure">
        Fee math is shown before wallet confirmation. Fantasy portfolio points, arcade score, and Vault Ascension
        activity never change published gacha odds or the Dust reward policy.
      </p>
    </section>
  );
}
