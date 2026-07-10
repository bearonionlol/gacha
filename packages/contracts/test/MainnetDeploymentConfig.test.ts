import { expect } from "chai";
import {
  MAINNET_DEPLOYMENT_CONFIRMATION,
  requireMainnetDeploymentConfig
} from "../scripts/mainnet-deployment-config";

describe("mainnet deployment configuration", function () {
  const address = (value: number): string => `0x${value.toString(16).padStart(40, "0")}`;

  const validEnvironment = (): Record<string, string> => ({
    MAINNET_DEPLOYMENT_CONFIRMATION,
    MAINNET_RELEASE_DEPLOYER_ADDRESS: address(1),
    MAINNET_RELEASE_ADMIN_ADDRESS: address(2),
    MAINNET_RELEASE_OPERATIONS_ADDRESS: address(3),
    MAINNET_RELEASE_GUARDIAN_ADDRESS: address(4),
    MAINNET_RELEASE_TREASURY_ADDRESS: address(5)
  });

  it("requires the exact paused-canary confirmation and every production role address", function () {
    const config = requireMainnetDeploymentConfig(validEnvironment());
    expect(config).to.deep.equal({
      deployer: address(1),
      protocolAdmin: address(2),
      operations: address(3),
      guardian: address(4),
      treasury: address(5)
    });

    const missingGuardian = validEnvironment() as Record<string, string | undefined>;
    delete missingGuardian.MAINNET_RELEASE_GUARDIAN_ADDRESS;
    expect(() => requireMainnetDeploymentConfig(missingGuardian)).to.throw(
      "MAINNET_RELEASE_GUARDIAN_ADDRESS is required"
    );
  });

  it("fails closed for a mistyped confirmation, zero address, or malformed address", function () {
    expect(() =>
      requireMainnetDeploymentConfig({
        ...validEnvironment(),
        MAINNET_DEPLOYMENT_CONFIRMATION: "deploy"
      })
    ).to.throw("MAINNET_DEPLOYMENT_CONFIRMATION must equal");

    expect(() =>
      requireMainnetDeploymentConfig({
        ...validEnvironment(),
        MAINNET_RELEASE_OPERATIONS_ADDRESS: address(0)
      })
    ).to.throw("MAINNET_RELEASE_OPERATIONS_ADDRESS must be a non-zero EVM address");

    expect(() =>
      requireMainnetDeploymentConfig({
        ...validEnvironment(),
        MAINNET_RELEASE_TREASURY_ADDRESS: "not-an-address"
      })
    ).to.throw("MAINNET_RELEASE_TREASURY_ADDRESS must be a non-zero EVM address");
  });

  it("requires separate deployer, admin, operations, guardian, and treasury accounts", function () {
    expect(() =>
      requireMainnetDeploymentConfig({
        ...validEnvironment(),
        MAINNET_RELEASE_GUARDIAN_ADDRESS: address(3)
      })
    ).to.throw("deployer, protocol admin, operations, guardian, and treasury addresses must be distinct");
  });
});
