// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {CollectibleForgePolicy} from "../CollectibleForgePolicy.sol";

contract TierPoolMockItemToken is ERC1155 {
    constructor() ERC1155("") {}

    function mintRange(address to, uint256 firstTokenId, uint256 count) external {
        for (uint256 offset = 0; offset < count; offset++) {
            _mint(to, firstTokenId + offset, 1, "");
        }
    }
}

contract TierPoolMockPolicy {
    mapping(uint256 tokenId => CollectibleForgePolicy.TokenPolicy policy) private _policies;

    function inventoryRegistry() external pure returns (address) {
        return address(0);
    }

    function setPolicyRange(uint256 firstTokenId, uint256 count, bytes32 setKey, uint8 tier) external {
        for (uint256 offset = 0; offset < count; offset++) {
            uint256 tokenId = firstTokenId + offset;
            _policies[tokenId] = CollectibleForgePolicy.TokenPolicy({
                canonicalKey: keccak256(abi.encode("tier-pool-mock", tokenId)),
                setKey: setKey,
                tier: tier,
                tradeInEligible: false,
                tierPoolEligible: true,
                exists: true
            });
        }
    }

    function getTokenPolicy(uint256 tokenId)
        external
        view
        returns (CollectibleForgePolicy.TokenPolicy memory)
    {
        return _policies[tokenId];
    }
}
