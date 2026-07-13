export const inventoryRegistryAbi = [
  {
    type: "function",
    name: "derivePhysicalTokenId",
    stateMutability: "pure",
    inputs: [{ name: "inventoryId", type: "string" }],
    outputs: [{ type: "uint256" }]
  }
] as const;

export const packSaleAbi = [
  {
    type: "event",
    name: "PackPurchased",
    anonymous: false,
    inputs: [
      { indexed: true, name: "purchaseId", type: "uint256" },
      { indexed: true, name: "dropId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "requestId", type: "bytes32" },
      { indexed: false, name: "price", type: "uint256" }
    ]
  },
  { type: "function", name: "nextDropId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextPurchaseId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasuryCredit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "remainingInventory",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "purchasesByWallet",
    stateMutability: "view",
    inputs: [
      { name: "dropId", type: "uint256" },
      { name: "buyer", type: "address" }
    ],
    outputs: [{ name: "purchases", type: "uint256" }]
  },
  {
    type: "function",
    name: "getDropSummary",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [
      {
        name: "summary",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "price", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "maxSupply", type: "uint256" },
          { name: "maxPerWallet", type: "uint256" },
          { name: "allowlistRoot", type: "bytes32" },
          { name: "sold", type: "uint256" },
          { name: "pendingPurchases", type: "uint256" },
          { name: "remainingInventory", type: "uint256" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getDropBonus",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [
      { name: "tokenIds", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "tokenUris", type: "string[]" }
    ]
  },
  {
    type: "function",
    name: "purchase",
    stateMutability: "payable",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [{ name: "purchaseId", type: "uint256" }]
  },
  {
    type: "function",
    name: "purchaseAllowlisted",
    stateMutability: "payable",
    inputs: [
      { name: "dropId", type: "uint256" },
      { name: "allowlistProof", type: "bytes32[]" }
    ],
    outputs: [{ name: "purchaseId", type: "uint256" }]
  },
  {
    type: "function",
    name: "reveal",
    stateMutability: "nonpayable",
    inputs: [{ name: "purchaseId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }]
  }
] as const;

export const marketplaceAbi = [
  { type: "function", name: "nextListingId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] },
  {
    type: "function",
    name: "listings",
    stateMutability: "view",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "sold", type: "bool" },
      { name: "cancelled", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "list",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "price", type: "uint256" }
    ],
    outputs: [{ name: "listingId", type: "uint256" }]
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawProceeds",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  }
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
          { name: "exists", type: "bool" },
          { name: "outputSupplyCap", type: "uint256" },
          { name: "metadataHash", type: "bytes32" },
          { name: "blueprintHash", type: "bytes32" },
          { name: "reservationReleased", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getRecipeInputs",
    stateMutability: "view",
    inputs: [{ name: "recipeId", type: "uint256" }],
    outputs: [
      { name: "tokenIds", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" }
    ]
  },
  {
    type: "function",
    name: "getRecipeCatalysts",
    stateMutability: "view",
    inputs: [{ name: "recipeId", type: "uint256" }],
    outputs: [
      { name: "tokenIds", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" }
    ]
  },
  {
    type: "function",
    name: "outputReserved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "walletCrafts",
    stateMutability: "view",
    inputs: [
      { name: "recipeId", type: "uint256" },
      { name: "wallet", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "craft",
    stateMutability: "payable",
    inputs: [{ name: "recipeId", type: "uint256" }],
    outputs: [{ name: "outputTokenId", type: "uint256" }]
  },
  {
    type: "function",
    name: "craftWithImprint",
    stateMutability: "payable",
    inputs: [
      { name: "recipeId", type: "uint256" },
      { name: "imprintHash", type: "bytes32" }
    ],
    outputs: [{ name: "outputTokenId", type: "uint256" }]
  }
] as const;

export const dustLedgerAbi = [
  {
    type: "function",
    name: "balancesOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amounts", type: "uint256[4]" }]
  }
] as const;

export const vaultPassportAbi = [
  {
    type: "function",
    name: "rankOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint8" }]
  }
] as const;

export const vaultForgeAbi = [
  {
    type: "function",
    name: "getRecipeConfig",
    stateMutability: "view",
    inputs: [{ name: "recipeKind", type: "uint8" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "dustAmounts", type: "uint256[4]" },
          { name: "fee", type: "uint256" },
          { name: "maxTotalClaims", type: "uint256" },
          { name: "maxClaimsPerWallet", type: "uint256" },
          { name: "version", type: "uint32" },
          { name: "tradeInCount", type: "uint8" },
          { name: "optionCount", type: "uint8" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "craft",
    stateMutability: "payable",
    inputs: [
      { name: "recipeKind", type: "uint8" },
      { name: "anchorTokenId", type: "uint256" },
      { name: "tradeInTokenIds", type: "uint256[]" },
      { name: "duplicateProofTokenIds", type: "uint256[]" },
      { name: "imprintHash", type: "bytes32" }
    ],
    outputs: [{ name: "claimId", type: "uint256" }]
  },
  {
    type: "function",
    name: "reveal",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "selectCandidate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimId", type: "uint256" },
      { name: "selectedIndex", type: "uint256" },
      { name: "to", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "settleDefault",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "exchangeDust",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fromKind", type: "uint8" },
      { name: "toKind", type: "uint8" }
    ],
    outputs: []
  }
] as const;

export const buybackVaultAbi = [
  {
    type: "function",
    name: "quotes",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "acceptQuote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawPayout",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  }
] as const;

export const redemptionRegistryAbi = [
  { type: "function", name: "nextRequestId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "requestRedemption",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "requestId", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "markPacked",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "markShipped",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requestId", type: "uint256" },
      { name: "trackingRef", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requestId", type: "uint256" },
      { name: "reason", type: "string" }
    ],
    outputs: []
  }
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
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" }
    ],
    outputs: []
  }
] as const;
