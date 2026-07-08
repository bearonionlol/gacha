import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";

export interface InventoryRecord {
  inventoryId: string;
  inventoryHash: string;
  metadataUri: string;
  redeemable: boolean;
  grailProtected: boolean;
  tokenId: bigint;
  tokenized: boolean;
  owner: string;
}

export type InventoryRegistry = Omit<BaseContract, "connect"> & {
  INVENTORY_ADMIN_ROLE(): Promise<string>;
  TOKENIZER_ROLE(): Promise<string>;
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
  anchorInventory(
    inventoryId: string,
    inventoryHash: string,
    metadataUri: string,
    redeemable: boolean,
    grailProtected: boolean
  ): Promise<ContractTransactionResponse>;
  markTokenized(inventoryId: string, owner: string): Promise<ContractTransactionResponse>;
  getInventory(inventoryId: string): Promise<InventoryRecord>;
  isGrailProtectedToken(tokenId: BigNumberish): Promise<boolean>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): InventoryRegistry;
};

function requireSigner(
  signers: HardhatEthersSigner[],
  index: number,
  label: string
): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) {
    throw new Error(`Missing ${label} signer`);
  }

  return signer;
}

export async function deployInventoryRegistryFixture() {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const inventoryAdmin = requireSigner(signers, 1, "inventory admin");
  const tokenizer = requireSigner(signers, 2, "tokenizer");
  const owner = requireSigner(signers, 3, "owner");
  const other = requireSigner(signers, 4, "other");
  const registry = (await ethers.deployContract("InventoryRegistry")) as unknown as InventoryRegistry;

  await registry.waitForDeployment();
  await registry.grantRole(await registry.INVENTORY_ADMIN_ROLE(), inventoryAdmin.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), tokenizer.address);

  return {
    registry,
    deployer,
    inventoryAdmin,
    tokenizer,
    owner,
    other
  };
}
