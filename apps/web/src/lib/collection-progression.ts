import type { CollectibleCard } from "./inventory";

export type SetProgressInput = {
  ownedTags: string[];
  targetTags: string[];
};

export type SetProgress = {
  missingTags: string[];
  nextBestAction: string;
  ownedCount: number;
  percentComplete: number;
  totalCount: number;
};

export type CollectionSetDefinition = {
  id: string;
  rewardLabel: string;
  targetTags: string[];
  title: string;
};

export type CollectionSetProgress = CollectionSetDefinition & SetProgress;

export type CollectionProgression = {
  albumTitle: "Vault Album";
  milestones: string[];
  nextChase: CollectionSetProgress;
  sets: CollectionSetProgress[];
};

const defaultCollectionSets: CollectionSetDefinition[] = [
  {
    id: "master-set",
    rewardLabel: "Founder album title",
    targetTags: ["pokemon_raw", "one_piece_raw", "pokemon_graded", "fire", "parallel", "alternate_art"],
    title: "Master set"
  },
  {
    id: "one-piece-parallel-run",
    rewardLabel: "Parallel hunter badge",
    targetTags: ["one_piece_raw", "parallel", "straw_hat", "graded"],
    title: "One Piece Parallel Run"
  },
  {
    id: "pokemon-grail-path",
    rewardLabel: "Grail curator badge",
    targetTags: ["pokemon_raw", "pokemon_graded", "fire", "charizard", "lugia", "alternate_art"],
    title: "Pokemon Grail Path"
  }
];

function normalizeTags(tags: string[]): Set<string> {
  return new Set(tags.map((tag) => tag.trim()).filter(Boolean));
}

function humanizeTag(tag: string): string {
  return tag.replace(/_/g, " ");
}

function buildNextBestAction(missingTags: string[]): string {
  if (missingTags.length === 0) {
    return "Flex, redeem, or craft from this completed set";
  }

  return `Trade, forge, or buy a ${humanizeTag(missingTags[0] ?? "target")} card`;
}

export function calculateSetProgress({ ownedTags, targetTags }: SetProgressInput): SetProgress {
  const ownedTagSet = normalizeTags(ownedTags);
  const uniqueTargetTags = Array.from(normalizeTags(targetTags));
  const missingTags = uniqueTargetTags.filter((tag) => !ownedTagSet.has(tag));
  const ownedCount = uniqueTargetTags.length - missingTags.length;
  const totalCount = uniqueTargetTags.length;
  const percentComplete = totalCount === 0 ? 0 : Math.round((ownedCount / totalCount) * 100);

  return {
    missingTags,
    nextBestAction: buildNextBestAction(missingTags),
    ownedCount,
    percentComplete,
    totalCount
  };
}

function buildMilestones(cards: CollectibleCard[]): string[] {
  const tags = normalizeTags(cards.flatMap((card) => card.tags));
  const milestones: string[] = [];

  if (cards.some((card) => card.grailTier === "grail")) {
    milestones.push("First grail secured");
  }

  if (new Set(cards.map((card) => card.brandLabel)).size >= 2) {
    milestones.push("Two brand lanes active");
  }

  if (tags.has("fire") && tags.has("parallel")) {
    milestones.push("Multiple Forge lanes unlocked");
  }

  return milestones;
}

export function buildCollectionProgression(
  cards: CollectibleCard[],
  setDefinitions: CollectionSetDefinition[] = defaultCollectionSets
): CollectionProgression {
  const ownedTags = cards.flatMap((card) => card.tags);
  const sets = setDefinitions.map((definition) => ({
    ...definition,
    ...calculateSetProgress({ ownedTags, targetTags: definition.targetTags })
  }));
  const nextChase =
    sets.find((set) => set.percentComplete < 100) ??
    sets[0] ?? {
      id: "empty-album",
      missingTags: [],
      nextBestAction: "Add a vault-backed card to start the album",
      ownedCount: 0,
      percentComplete: 0,
      rewardLabel: "Starter album",
      targetTags: [],
      title: "Starter album",
      totalCount: 0
    };

  return {
    albumTitle: "Vault Album",
    milestones: buildMilestones(cards),
    nextChase,
    sets
  };
}
