import { createHash } from "node:crypto";

export type PhotoHashInput = string | readonly string[];

export const normalizePhotoHashInput = (photos: PhotoHashInput): string[] => {
  return typeof photos === "string" ? [photos] : [...photos];
};

export const createPhotoHash = (photos: PhotoHashInput): string => {
  const canonicalPayload = JSON.stringify(normalizePhotoHashInput(photos));
  const digest = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");

  return `sha256:${digest}`;
};
