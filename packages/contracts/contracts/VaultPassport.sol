// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract VaultPassport is AccessControl {
    bytes32 public constant FORGE_ROLE = keccak256("FORGE_ROLE");
    uint8 public constant STARTING_RANK = 1;
    uint8 public constant MAX_RANK = 4;

    error InvalidAddress();
    error InvalidAnchor();
    error RankMismatch(address account, uint8 expected, uint8 actual);
    error MaximumRankReached(address account);

    event PassportAdvanced(
        address indexed account,
        uint8 previousRank,
        uint8 rank,
        uint256 indexed anchorTokenId,
        uint256 indexed claimId
    );

    mapping(address account => uint8 rank) private _storedRanks;
    mapping(address account => uint256 tokenId) public latestAnchorTokenId;
    mapping(address account => uint256 claimId) public latestAscensionClaimId;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function rankOf(address account) public view returns (uint8) {
        uint8 storedRank = _storedRanks[account];
        return storedRank == 0 ? STARTING_RANK : storedRank;
    }

    function advance(address account, uint256 anchorTokenId, uint8 expectedRank, uint256 claimId)
        external
        onlyRole(FORGE_ROLE)
        returns (uint8 newRank)
    {
        if (account == address(0)) revert InvalidAddress();
        if (anchorTokenId == 0) revert InvalidAnchor();
        uint8 currentRank = rankOf(account);
        if (currentRank != expectedRank) revert RankMismatch(account, expectedRank, currentRank);
        if (currentRank >= MAX_RANK) revert MaximumRankReached(account);

        newRank = currentRank + 1;
        _storedRanks[account] = newRank;
        latestAnchorTokenId[account] = anchorTokenId;
        latestAscensionClaimId[account] = claimId;
        emit PassportAdvanced(account, currentRank, newRank, anchorTokenId, claimId);
    }
}
