import { buildCollectionProgression, calculateSetProgress } from "../collection-progression";
import { collectibleCards } from "../inventory";

describe("collection progression", () => {
  it("calculates set completion and the next chase from owned tags", () => {
    const progress = calculateSetProgress({
      ownedTags: ["pokemon_raw", "fire", "alternate_art"],
      targetTags: ["pokemon_raw", "fire", "water", "graded"]
    });

    expect(progress).toEqual({
      missingTags: ["water", "graded"],
      nextBestAction: "Trade, forge, or buy a water card",
      ownedCount: 2,
      percentComplete: 50,
      totalCount: 4
    });
  });

  it("builds album progression from inventory-backed cards", () => {
    const progression = buildCollectionProgression(collectibleCards);

    expect(progression.albumTitle).toBe("Vault Album");
    expect(progression.sets.map((set) => set.title)).toContain("Master set");
    expect(progression.nextChase.title).toBe("One Piece Parallel Run");
    expect(progression.nextChase.nextBestAction).toMatch(/Trade, forge, or buy/i);
    expect(progression.milestones).toContain("First grail secured");
  });
});
