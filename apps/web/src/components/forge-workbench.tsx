import { Hammer, LockKeyhole, PackagePlus, ShieldCheck, Sparkles } from "lucide-react";
import { ActionGuardPanel } from "./action-guard-panel";
import { formatCents } from "../lib/format";
import { forgeRecipes } from "../lib/game-state";
import { collectibleCards } from "../lib/inventory";

const gridSlots = Array.from({ length: 9 }, (_, index) => index + 1);
const selectedRecipe = forgeRecipes[0] ?? {
  id: "recipe-preview-fallback",
  title: "Preview Recipe",
  progressPercent: 0,
  ingredients: [],
  output: "No recipe selected",
  cap: 0,
  feeCents: 0,
  warning: "Crafting preview does not burn items or guarantee secondary market value."
};

export function ForgeWorkbench() {
  const protectedInputs = collectibleCards.filter((card) => card.grailTier === "grail" || card.grailTier === "major");

  return (
    <section className="forge-workbench" aria-label="Forge workbench">
      <div className="panel recipe-book">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Recipes</span>
            <h2>Recipe Book</h2>
          </div>
          <span className="chain-pill">{forgeRecipes.length} demo recipes</span>
        </div>

        <div className="recipe-list">
          {forgeRecipes.map((recipe) => (
            <article className="recipe-card" key={recipe.id}>
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">Cap {recipe.cap}</span>
                  <h3>{recipe.title}</h3>
                </div>
                <span className="tier-pill">
                  <Hammer size={14} aria-hidden="true" />
                  {formatCents(recipe.feeCents)}
                </span>
              </div>
              <p>{recipe.warning}</p>
              <div className="tag-row" aria-label={`${recipe.title} ingredients`}>
                {recipe.ingredients.map((ingredient) => (
                  <span key={ingredient}>{ingredient}</span>
                ))}
              </div>
              <div className="progress-row">
                <span>{recipe.progressPercent}% preview progress</span>
                <strong>{recipe.output}</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${recipe.progressPercent}%` }} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel forge-grid-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Craft surface</span>
            <h2>3 x 3 Forge Grid</h2>
          </div>
          <span className="chain-pill">grail-protected</span>
        </div>
        <p>
          Place sample ingredients for a dry-run preview. Protected grail and major inputs stay locked by default and no
          inventory is burned in this demo.
        </p>

        <div className="forge-grid" aria-label="3 x 3 Forge Grid slots" role="grid">
          {gridSlots.map((slot) => {
            const card = protectedInputs[slot - 1];

            return (
              <div
                aria-label={card ? `Protected forge slot ${slot} ${card.title}` : `Open forge slot ${slot}`}
                className={card ? "forge-slot protected" : "forge-slot"}
                key={slot}
                role="gridcell"
              >
                {card ? (
                  <>
                    <LockKeyhole size={18} aria-hidden="true" />
                    <strong>{card.title}</strong>
                    <span>{card.grailTier} input locked</span>
                  </>
                ) : (
                  <>
                    <PackagePlus size={18} aria-hidden="true" />
                    <strong>Slot {slot}</strong>
                    <span>Open preview cell</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel ingredient-tray">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Inventory tray</span>
            <h2>Sample Ingredients</h2>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>

        <div className="ingredient-list">
          {collectibleCards.map((card) => (
            <article className="ingredient-row" key={card.id}>
              <div>
                <h3>{card.title}</h3>
                <p>{card.subtitle}</p>
              </div>
              <div className="tag-row" aria-label={`${card.title} crafting tags`}>
                {card.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel output-preview">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Preview result</span>
            <h2>Output Preview</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Preview output</dt>
            <dd>{selectedRecipe.output}</dd>
          </div>
          <div>
            <dt>Recipe cap</dt>
            <dd>{selectedRecipe.cap} previews</dd>
          </div>
          <div>
            <dt>Preview fee</dt>
            <dd>{formatCents(selectedRecipe.feeCents)}</dd>
          </div>
          <div>
            <dt>Result mode</dt>
            <dd>Demo only</dd>
          </div>
        </dl>
        <p className="disclosure">
          Preview copy only: this workbench does not submit burns, guarantee recipe outcomes, or promise resale value.
        </p>
        <ActionGuardPanel action="Craft recipe" operator="Forge" />
      </div>
    </section>
  );
}
