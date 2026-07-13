import { ZeroAddress, getAddress, isAddress } from "ethers";

export type MainnetRandomnessConfig = {
  coordinator: string;
  coordinatorCodeHash: string;
  maxRequestFee: bigint;
};

export function requireMainnetRandomnessConfig(
  environment: NodeJS.ProcessEnv = process.env
): MainnetRandomnessConfig {
  const coordinator = environment.ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS;
  const coordinatorCodeHash = environment.ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH;
  const maxRequestFeeRaw = environment.ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI;

  if (coordinator === undefined || !isAddress(coordinator) || coordinator === ZeroAddress) {
    throw new Error(
      "Mainnet deploy blocked: ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS must be an approved coordinator contract"
    );
  }
  if (coordinatorCodeHash === undefined || !/^0x[0-9a-fA-F]{64}$/.test(coordinatorCodeHash)) {
    throw new Error(
      "Mainnet deploy blocked: ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH must pin the reviewed coordinator bytecode"
    );
  }
  if (maxRequestFeeRaw === undefined || !/^\d+$/.test(maxRequestFeeRaw)) {
    throw new Error(
      "Mainnet deploy blocked: ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI must be a non-negative integer"
    );
  }

  return {
    coordinator: getAddress(coordinator),
    coordinatorCodeHash: coordinatorCodeHash.toLowerCase(),
    maxRequestFee: BigInt(maxRequestFeeRaw)
  };
}
