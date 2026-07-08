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

export type ItemToken = Omit<BaseContract, "connect"> & {
  MINTER_ROLE(): Promise<string>;
  BURNER_ROLE(): Promise<string>;
  URI_SETTER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  balanceOf(account: string, tokenId: BigNumberish): Promise<bigint>;
  "totalSupply(uint256)"(tokenId: BigNumberish): Promise<bigint>;
  uri(tokenId: BigNumberish): Promise<string>;
  mintInventoryItem(
    to: string,
    tokenId: BigNumberish,
    inventoryId: string,
    tokenUri: string
  ): Promise<ContractTransactionResponse>;
  mintGameItem(
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    tokenUri: string
  ): Promise<ContractTransactionResponse>;
  burn(from: string, tokenId: BigNumberish, amount: BigNumberish): Promise<ContractTransactionResponse>;
  setTokenURI(tokenId: BigNumberish, tokenUri: string): Promise<ContractTransactionResponse>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  setApprovalForAll(operator: string, approved: boolean): Promise<ContractTransactionResponse>;
  safeTransferFrom(
    from: string,
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    data: string
  ): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): ItemToken;
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

export async function deployProtocolFixture() {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const inventoryAdmin = requireSigner(signers, 1, "inventory admin");
  const tokenizer = requireSigner(signers, 2, "tokenizer");
  const owner = requireSigner(signers, 3, "owner");
  const other = requireSigner(signers, 4, "other");
  const minter = requireSigner(signers, 5, "minter");
  const burner = requireSigner(signers, 6, "burner");
  const uriSetter = requireSigner(signers, 7, "URI setter");
  const pauser = requireSigner(signers, 8, "pauser");
  const recipient = requireSigner(signers, 9, "recipient");
  const registry = (await ethers.deployContract("InventoryRegistry")) as unknown as InventoryRegistry;
  const itemToken = (await ethers.deployContract("ItemToken")) as unknown as ItemToken;

  await registry.waitForDeployment();
  await itemToken.waitForDeployment();
  await registry.grantRole(await registry.INVENTORY_ADMIN_ROLE(), inventoryAdmin.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), tokenizer.address);
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), minter.address);
  await itemToken.grantRole(await itemToken.BURNER_ROLE(), burner.address);
  await itemToken.grantRole(await itemToken.URI_SETTER_ROLE(), uriSetter.address);
  await itemToken.grantRole(await itemToken.PAUSER_ROLE(), pauser.address);

  return {
    registry,
    itemToken,
    deployer,
    inventoryAdmin,
    tokenizer,
    owner,
    other,
    minter,
    burner,
    uriSetter,
    pauser,
    recipient
  };
}
