import { AppShell } from "../../components/app-shell";
import { ForgeWorkbench } from "../../components/forge-workbench";

export default function ForgePage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="forge-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Crafting preview</span>
              <h1 id="forge-title">Forge</h1>
            </div>
            <span className="chain-pill">Demo workbench</span>
          </div>
          <p>
            Build sample recipes from verified inventory tags, inspect caps and preview fees, and keep grail inputs
            protected until a later protocol confirmation flow exists.
          </p>
        </section>
        <ForgeWorkbench />
      </main>
    </AppShell>
  );
}
