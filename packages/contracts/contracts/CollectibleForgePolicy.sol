// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";

contract CollectibleForgePolicy is AccessControl {
    bytes32 public constant POLICY_ADMIN_ROLE = keccak256("POLICY_ADMIN_ROLE");
    uint8 public constant MAX_FORGE_TIER = 4;

    struct TokenPolicy {
        bytes32 canonicalKey;
        bytes32 setKey;
        uint8 tier;
        bool tradeInEligible;
        bool tierPoolEligible;
        bool exists;
    }

    error InvalidAddress();
    error InvalidTokenPolicy(uint256 tokenId);
    error PolicyAlreadySet(uint256 tokenId);
    error PolicyNotFound(uint256 tokenId);

    event TokenPolicySet(
        uint256 indexed tokenId,
        bytes32 indexed canonicalKey,
        bytes32 indexed setKey,
        uint8 tier,
        bool tradeInEligible,
        bool tierPoolEligible
    );

    InventoryRegistry public immutable inventoryRegistry;
    mapping(uint256 tokenId => TokenPolicy policy) private _policies;

    constructor(InventoryRegistry inventoryRegistry_) {
        if (address(inventoryRegistry_) == address(0)) revert InvalidAddress();
        inventoryRegistry = inventoryRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setTokenPolicy(
        uint256 tokenId,
        bytes32 canonicalKey,
        bytes32 setKey,
        uint8 tier,
        bool tradeInEligible,
        bool tierPoolEligible
    ) external onlyRole(POLICY_ADMIN_ROLE) {
        if (_policies[tokenId].exists) revert PolicyAlreadySet(tokenId);
        inventoryRegistry.validatePhysicalTokenId(tokenId);
        inventoryRegistry.getInventoryByTokenId(tokenId);
        if (canonicalKey == bytes32(0) || setKey == bytes32(0) || tier == 0 || tier > MAX_FORGE_TIER) {
            revert InvalidTokenPolicy(tokenId);
        }

        _policies[tokenId] = TokenPolicy({
            canonicalKey: canonicalKey,
            setKey: setKey,
            tier: tier,
            tradeInEligible: tradeInEligible,
            tierPoolEligible: tierPoolEligible,
            exists: true
        });

        emit TokenPolicySet(tokenId, canonicalKey, setKey, tier, tradeInEligible, tierPoolEligible);
    }

    function getTokenPolicy(uint256 tokenId) external view returns (TokenPolicy memory) {
        TokenPolicy memory policy = _policies[tokenId];
        if (!policy.exists) revert PolicyNotFound(tokenId);
        return policy;
    }

    function hasPolicy(uint256 tokenId) external view returns (bool) {
        return _policies[tokenId].exists;
    }
}
