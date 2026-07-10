import { config as loadEnv } from "dotenv";
import { readFileSync } from "fs";
import type { HardhatUserConfig } from "hardhat/config";
import path from "path";
import ts from "typescript";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import {
  loadHardhatForkingConfig,
  loadLoopbackRpcUrl
} from "./scripts/mainnet-fork-config";

loadEnv();

type ParseTaskParamArguments = (this: unknown, taskDefinition: unknown, rawCLAs: string[]) => unknown;

interface HardhatArgumentsParserPrototype {
  _parseTaskParamArguments: ParseTaskParamArguments & { gachaPnpmSeparatorPatch?: true };
}

function allowPnpmTaskSeparator(): void {
  const { ArgumentsParser } = require("hardhat/internal/cli/ArgumentsParser") as {
    ArgumentsParser: { prototype: HardhatArgumentsParserPrototype };
  };
  const original = ArgumentsParser.prototype._parseTaskParamArguments;

  if (original.gachaPnpmSeparatorPatch) {
    return;
  }

  const patched: ParseTaskParamArguments & { gachaPnpmSeparatorPatch?: true } = function (
    this: unknown,
    taskDefinition: unknown,
    rawCLAs: string[]
  ) {
    return original.call(
      this,
      taskDefinition,
      rawCLAs.filter((arg) => arg !== "--")
    );
  };

  patched.gachaPnpmSeparatorPatch = true;
  ArgumentsParser.prototype._parseTaskParamArguments = patched;
}

allowPnpmTaskSeparator();

const sharedChainsPath = path.resolve(__dirname, "../shared/src/chains.ts");

function readSharedChainConstants(): ReadonlyMap<string, string | number> {
  const sourceText = readFileSync(sharedChainsPath, "utf8");
  const source = ts.createSourceFile(sharedChainsPath, sourceText, ts.ScriptTarget.Latest, true);
  const constants = new Map<string, string | number>();

  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }

    const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      if (ts.isStringLiteral(declaration.initializer)) {
        constants.set(declaration.name.text, declaration.initializer.text);
      }

      if (ts.isNumericLiteral(declaration.initializer)) {
        constants.set(declaration.name.text, Number(declaration.initializer.text));
      }
    }
  });

  return constants;
}

function requireSharedString(constants: ReadonlyMap<string, string | number>, name: string): string {
  const value = constants.get(name);
  if (typeof value !== "string") {
    throw new Error(`Missing shared string constant ${name}`);
  }

  return value;
}

function requireSharedNumber(constants: ReadonlyMap<string, string | number>, name: string): number {
  const value = constants.get(name);
  if (typeof value !== "number") {
    throw new Error(`Missing shared number constant ${name}`);
  }

  return value;
}

const sharedChainConstants = readSharedChainConstants();
const ROBINHOOD_CHAIN_MAINNET_ID = requireSharedNumber(
  sharedChainConstants,
  "ROBINHOOD_CHAIN_MAINNET_ID"
);
const ROBINHOOD_CHAIN_TESTNET_ID = requireSharedNumber(
  sharedChainConstants,
  "ROBINHOOD_CHAIN_TESTNET_ID"
);
const ROBINHOOD_CHAIN_MAINNET_RPC_URL = requireSharedString(
  sharedChainConstants,
  "ROBINHOOD_CHAIN_MAINNET_RPC_URL"
);
const ROBINHOOD_CHAIN_TESTNET_RPC_URL = requireSharedString(
  sharedChainConstants,
  "ROBINHOOD_CHAIN_TESTNET_RPC_URL"
);

const ROBINHOOD_TESTNET_RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC_URL ?? ROBINHOOD_CHAIN_TESTNET_RPC_URL;
const ROBINHOOD_MAINNET_RPC_URL =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? ROBINHOOD_CHAIN_MAINNET_RPC_URL;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const hardhatFork = loadHardhatForkingConfig(process.env);
const localRpcUrl = loadLoopbackRpcUrl(process.env);

const deployerAccounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      ...(hardhatFork === undefined
        ? {}
        : {
            forking: {
              url: hardhatFork.rpcUrl,
              blockNumber: hardhatFork.blockNumber,
              httpHeaders: hardhatFork.rpcHeaders
            }
          })
    },
    localhost: {
      url: localRpcUrl,
      chainId: 31337
    },
    robinhoodTestnet: {
      url: ROBINHOOD_TESTNET_RPC_URL,
      chainId: ROBINHOOD_CHAIN_TESTNET_ID,
      accounts: deployerAccounts
    },
    robinhoodMainnet: {
      url: ROBINHOOD_MAINNET_RPC_URL,
      chainId: ROBINHOOD_CHAIN_MAINNET_ID,
      accounts: deployerAccounts
    }
  }
};

export default config;
