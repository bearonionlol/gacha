export const packSaleAbi = [
  { type: "function", name: "nextDropId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextPurchaseId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasuryCredit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "remainingInventory",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  }
] as const;

export const marketplaceAbi = [
  { type: "function", name: "nextListingId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] }
] as const;

export const forgeAbi = [
  { type: "function", name: "nextRecipeId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "recipes",
    stateMutability: "view",
    inputs: [{ name: "recipeId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "outputTokenId", type: "uint256" },
          { name: "outputAmount", type: "uint256" },
          { name: "outputUri", type: "string" },
          { name: "fee", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "maxTotalCrafts", type: "uint256" },
          { name: "maxCraftsPerWallet", type: "uint256" },
          { name: "totalCrafts", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "requiresManualReview", type: "bool" },
          { name: "excludeGrailProtectedInputs", type: "bool" },
          { name: "exists", type: "bool" }
        ]
      }
    ]
  }
] as const;

export const redemptionRegistryAbi = [
  { type: "function", name: "nextRequestId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
] as const;

export const itemTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;
