import path from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4_663;
export const FORK_LOCAL_CHAIN_ID = 31_337;
export const DEFAULT_FORK_LOCAL_PORT = 18_545;
export const ROBINHOOD_PUBLIC_MAINNET_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const FORK_ONLY_RANDOMNESS_OVERRIDE =
  "ALLOW_OPERATOR_RANDOMNESS_ON_MAINNET_FORK_ONLY";

export type Environment = Readonly<Record<string, string | undefined>>;

export type ForkSourceConfig = {
  rpcUrl: string;
  rpcHeaders: Readonly<Record<string, string>>;
  blockNumber: number;
  usesPublicRpcDevelopmentOverride: boolean;
};

export type ExpectedReleaseInputs = {
  deployer: string;
  admin: string;
  operations: string;
  guardian: string;
  treasury: string;
  randomnessCoordinator: string;
  randomnessCoordinatorCodeHash: string;
  randomnessMaxRequestFeeWei: string;
};

export type MainnetForkConfig = {
  source: ForkSourceConfig;
  expected: ExpectedReleaseInputs;
  localHost: "127.0.0.1";
  localPort: number;
  localRpcUrl: string;
  manifestPath: string;
};

function requireEnvironmentValue(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parsePositiveSafeInteger(raw: string, name: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a pinned positive decimal integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} exceeds the safe integer range`);
  }
  return value;
}

function parseAddress(env: Environment, name: string): string {
  const value = requireEnvironmentValue(env, name);
  if (!isAddress(value) || value.toLowerCase() === ZeroAddress) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return getAddress(value);
}

function parseCodeHash(env: Environment, name: string): string {
  const value = requireEnvironmentValue(env, name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${name} must be a non-zero 32-byte hex code hash`);
  }
  return value.toLowerCase();
}

function parseNonNegativeInteger(env: Environment, name: string): string {
  const value = requireEnvironmentValue(env, name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer in wei`);
  }
  return BigInt(value).toString();
}

function parseRpcHeaders(env: Environment): Readonly<Record<string, string>> {
  const name = env.ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME?.trim();
  const value = env.ROBINHOOD_MAINNET_FORK_RPC_HEADER_VALUE?.trim();
  if ((name === undefined) !== (value === undefined)) {
    throw new Error(
      "ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME and ROBINHOOD_MAINNET_FORK_RPC_HEADER_VALUE must be set together"
    );
  }
  if (name === undefined || value === undefined) {
    return {};
  }
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new Error("ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME is not a valid HTTP header name");
  }
  if (/^(host|content-length)$/i.test(name)) {
    throw new Error(`RPC authentication header ${name} is not allowed`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("ROBINHOOD_MAINNET_FORK_RPC_HEADER_VALUE cannot contain newlines");
  }
  return { [name]: value };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function loadForkSourceConfig(env: Environment): ForkSourceConfig {
  const rawUrl = requireEnvironmentValue(env, "ROBINHOOD_MAINNET_FORK_RPC_URL");
  let rpcUrl: URL;
  try {
    rpcUrl = new URL(rawUrl);
  } catch {
    throw new Error("ROBINHOOD_MAINNET_FORK_RPC_URL must be a valid URL");
  }

  const developmentOverride =
    env.ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT === "true";
  if (rpcUrl.protocol !== "https:" && !(developmentOverride && isLoopbackHost(rpcUrl.hostname))) {
    throw new Error(
      "ROBINHOOD_MAINNET_FORK_RPC_URL must use HTTPS; loopback HTTP requires ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT=true"
    );
  }

  const publicRpc = new URL(ROBINHOOD_PUBLIC_MAINNET_RPC_URL);
  const usesPublicRpc =
    rpcUrl.hostname.toLowerCase() === publicRpc.hostname.toLowerCase();
  if (usesPublicRpc && !developmentOverride) {
    throw new Error(
      "The public/default Robinhood RPC is refused for a production rehearsal; provide an authenticated dedicated endpoint or set ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT=true for development only"
    );
  }

  const rpcHeaders = parseRpcHeaders(env);
  const endpointLooksDedicated =
    !usesPublicRpc &&
    (rpcUrl.username.length > 0 ||
      rpcUrl.password.length > 0 ||
      rpcUrl.search.length > 0 ||
      rpcUrl.pathname !== "/" ||
      Object.keys(rpcHeaders).length > 0 ||
      !isLoopbackHost(rpcUrl.hostname));
  if (!endpointLooksDedicated && !developmentOverride) {
    throw new Error(
      "ROBINHOOD_MAINNET_FORK_RPC_URL must identify an authenticated dedicated endpoint"
    );
  }

  const blockNumber = parsePositiveSafeInteger(
    requireEnvironmentValue(env, "ROBINHOOD_MAINNET_FORK_BLOCK"),
    "ROBINHOOD_MAINNET_FORK_BLOCK"
  );

  return {
    rpcUrl: rpcUrl.toString(),
    rpcHeaders,
    blockNumber,
    usesPublicRpcDevelopmentOverride: usesPublicRpc && developmentOverride
  };
}

export function loadExpectedReleaseInputs(env: Environment): ExpectedReleaseInputs {
  return {
    deployer: parseAddress(env, "MAINNET_RELEASE_DEPLOYER_ADDRESS"),
    admin: parseAddress(env, "MAINNET_RELEASE_ADMIN_ADDRESS"),
    operations: parseAddress(env, "MAINNET_RELEASE_OPERATIONS_ADDRESS"),
    guardian: parseAddress(env, "MAINNET_RELEASE_GUARDIAN_ADDRESS"),
    treasury: parseAddress(env, "MAINNET_RELEASE_TREASURY_ADDRESS"),
    randomnessCoordinator: parseAddress(env, "ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS"),
    randomnessCoordinatorCodeHash: parseCodeHash(
      env,
      "ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH"
    ),
    randomnessMaxRequestFeeWei: parseNonNegativeInteger(
      env,
      "ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI"
    )
  };
}

export function assertForkOnlyRandomnessOverride(env: Environment): void {
  if (env[FORK_ONLY_RANDOMNESS_OVERRIDE] !== "true") {
    throw new Error(
      `${FORK_ONLY_RANDOMNESS_OVERRIDE}=true is required to deploy the demo commit/reveal provider inside the isolated fork rehearsal`
    );
  }
}

function parseLocalPort(env: Environment): number {
  const raw = env.MAINNET_FORK_LOCAL_PORT?.trim();
  if (!raw) return DEFAULT_FORK_LOCAL_PORT;
  const port = parsePositiveSafeInteger(raw, "MAINNET_FORK_LOCAL_PORT");
  if (port < 1_024 || port > 65_535) {
    throw new Error("MAINNET_FORK_LOCAL_PORT must be between 1024 and 65535");
  }
  return port;
}

export function loadMainnetForkConfig(
  env: Environment,
  repositoryRoot: string
): MainnetForkConfig {
  if (env.DEPLOYER_PRIVATE_KEY?.trim()) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY must be unset for a no-broadcast mainnet fork rehearsal"
    );
  }
  assertForkOnlyRandomnessOverride(env);
  const localPort = parseLocalPort(env);
  const configuredManifestPath = env.MAINNET_RELEASE_MANIFEST_PATH?.trim();
  const manifestPath = configuredManifestPath
    ? path.resolve(configuredManifestPath)
    : path.join(repositoryRoot, "release", "robinhood-mainnet-plan.json");

  return {
    source: loadForkSourceConfig(env),
    expected: loadExpectedReleaseInputs(env),
    localHost: "127.0.0.1",
    localPort,
    localRpcUrl: `http://127.0.0.1:${localPort}`,
    manifestPath
  };
}

export function loadHardhatForkingConfig(
  env: Environment
): ForkSourceConfig | undefined {
  if (env.GACHA_HARDHAT_MAINNET_FORK_MODE !== "true") {
    return undefined;
  }
  return loadForkSourceConfig(env);
}

export function loadLoopbackRpcUrl(env: Environment): string {
  const configured = env.GACHA_LOCAL_RPC_URL?.trim();
  if (!configured) return "http://127.0.0.1:8545";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("GACHA_LOCAL_RPC_URL must be a valid URL");
  }
  if (url.protocol !== "http:" || !isLoopbackHost(url.hostname)) {
    throw new Error("GACHA_LOCAL_RPC_URL must be a loopback HTTP endpoint");
  }
  return url.toString().replace(/\/$/, "");
}
