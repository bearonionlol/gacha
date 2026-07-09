import { AppShell } from "../../components/app-shell";
import { ForgeWorkbench } from "../../components/forge-workbench";

export default function ForgePage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="forge-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">On-chain crafting</span>
              <h1 id="forge-title">Forge</h1>
            </div>
            <span className="chain-pill">Forge v3</span>
          </div>
          <p>
            Recycle duplicates, solve bounded blueprints, and sign each output with a personal imprint. Physical cards
            can unlock catalyst paths but are never burned by Forge.
          </p>
        </section>
        <ForgeWorkbench />
      </main>
    </AppShell>
  );
}
