import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  validateReleaseManifest,
  type ReleaseManifest
} from "./release-manifest";

async function main(): Promise<void> {
  const configuredPath = process.argv[2] ?? process.env.MAINNET_RELEASE_MANIFEST_PATH;
  if (!configuredPath) {
    throw new Error(
      "Provide a manifest path argument or set MAINNET_RELEASE_MANIFEST_PATH"
    );
  }
  const manifestPath = path.resolve(configuredPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ReleaseManifest;
  validateReleaseManifest(manifest);
  console.log(
    `validated ${manifestPath} (${manifest.integrity.canonicalBodySha256})`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
