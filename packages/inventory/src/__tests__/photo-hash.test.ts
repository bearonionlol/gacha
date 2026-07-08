import { describe, expect, it } from "vitest";

import { createPhotoHash } from "../photo-hash";

describe("createPhotoHash", () => {
  it("returns a sha256-prefixed lowercase hex digest", () => {
    expect(createPhotoHash("front.jpg")).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("matches the canonical SHA-256 digest for a single photo string", () => {
    expect(createPhotoHash("front.jpg")).toBe(
      "sha256:1b0ab7c853927324a4c95e250dd802be4d3c84b9f5f77c62160428ad4cc548ca"
    );
  });

  it("is deterministic for ordered photo arrays", () => {
    expect(createPhotoHash(["front.jpg", "back.jpg"])).toBe(
      "sha256:35c41478a72e5ac3b89fcf2eaa7b52967978bd52c29996c3b9b514701a4d3fbc"
    );
    expect(createPhotoHash(["front.jpg", "back.jpg"])).not.toBe(createPhotoHash(["back.jpg", "front.jpg"]));
  });
});
