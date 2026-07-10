import { expect } from "chai";
import { requireMainnetRandomnessConfig } from "../scripts/mainnet-randomness-config";

const coordinator = "0x00000000000000000000000000000000000000C8";
const codeHash = `0x${"ab".repeat(32)}`;

describe("mainnet randomness deployment config", function () {
  it("normalizes an explicit coordinator, bytecode hash, and fee cap", function () {
    expect(
      requireMainnetRandomnessConfig({
        ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS: coordinator.toLowerCase(),
        ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH: codeHash.toUpperCase().replace("0X", "0x"),
        ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI: "100000000000000"
      })
    ).to.deep.equal({
      coordinator,
      coordinatorCodeHash: codeHash,
      maxRequestFee: 100000000000000n
    });
  });

  it("fails closed when any reviewed mainnet input is absent or malformed", function () {
    expect(() => requireMainnetRandomnessConfig({})).to.throw(
      "ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS"
    );
    expect(() =>
      requireMainnetRandomnessConfig({
        ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS: coordinator,
        ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH: "0x1234",
        ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI: "1"
      })
    ).to.throw("ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH");
    expect(() =>
      requireMainnetRandomnessConfig({
        ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS: coordinator,
        ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH: codeHash,
        ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI: "-1"
      })
    ).to.throw("ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI");
  });
});
