import { BadgeDollarSign, PercentCircle } from "lucide-react";
import { PackPurchasePanel } from "./testnet-write-panels";
import { activeDrop } from "../lib/game-state";
import { formatCents, formatCompactNumber } from "../lib/format";

export function DropLobby() {
  return (
    <section className="panel drop-lobby" aria-labelledby="drop-command-title">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Active drop</span>
          <h1 id="drop-command-title">Drop Command</h1>
        </div>
        <span className="chain-pill">Testnet demo</span>
      </div>

      <div className="drop-title-row">
        <div>
          <h2>{activeDrop.title}</h2>
          <p>{activeDrop.inventoryBackedCount} vault items backing the demo drop pool.</p>
        </div>
        <span className="chain-pill">Live write enabled</span>
      </div>
      <PackPurchasePanel />

      <dl className="drop-stats">
        <div>
          <dt>
            <BadgeDollarSign size={15} aria-hidden="true" />
            Pack price
          </dt>
          <dd>{formatCents(activeDrop.packPriceCents)}</dd>
        </div>
        <div>
          <dt>Supply</dt>
          <dd>
            {formatCompactNumber(activeDrop.remainingSupply)} / {formatCompactNumber(activeDrop.totalSupply)}
          </dd>
        </div>
        <div>
          <dt>Inventory backed</dt>
          <dd>{activeDrop.inventoryBackedCount} items</dd>
        </div>
      </dl>

      <div className="odds-table" aria-label="Drop odds">
        <div className="odds-heading">
          <PercentCircle size={16} aria-hidden="true" />
          <span>Published odds</span>
        </div>
        {activeDrop.odds.map((row) => (
          <div className="odds-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.chancePercent}%</strong>
          </div>
        ))}
      </div>

      <p className="disclosure">{activeDrop.randomnessDisclosure}</p>
    </section>
  );
}
