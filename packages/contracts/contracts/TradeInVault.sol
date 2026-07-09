// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ItemToken} from "./ItemToken.sol";

contract TradeInVault is AccessControl, ERC1155Holder, ReentrancyGuard {
    bytes32 public constant CUSTODY_ADMIN_ROLE = keccak256("CUSTODY_ADMIN_ROLE");

    error InvalidAddress();
    error ForgeAlreadyConfigured();
    error UnauthorizedForge(address caller);
    error UnexpectedERC1155Received();
    error UnexpectedERC1155BatchReceived();
    error TokenAlreadyPending(uint256 tokenId, uint256 claimId);
    error ClaimTokenMismatch(uint256 claimId, uint256 tokenId);
    error TokenStillPending(uint256 tokenId, uint256 claimId);

    event ForgeConfigured(address indexed forge);
    event TradeInReceived(uint256 indexed claimId, address indexed owner, uint256 indexed tokenId);
    event TradeInSettled(uint256 indexed claimId, uint256 indexed tokenId);
    event TradeInReturned(uint256 indexed claimId, address indexed owner, uint256 indexed tokenId);
    event SettledInventoryReleased(uint256 indexed tokenId, address indexed to);

    ItemToken public immutable itemToken;
    address public forge;
    mapping(uint256 tokenId => uint256 claimId) public pendingClaimByToken;

    constructor(ItemToken itemToken_) {
        if (address(itemToken_) == address(0)) revert InvalidAddress();
        itemToken = itemToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyForge() {
        if (msg.sender != forge) revert UnauthorizedForge(msg.sender);
        _;
    }

    function configureForge(address forge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (forge_ == address(0)) revert InvalidAddress();
        if (forge != address(0)) revert ForgeAlreadyConfigured();
        forge = forge_;
        emit ForgeConfigured(forge_);
    }

    function settleClaim(uint256 claimId, uint256[] calldata tokenIds) external onlyForge {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint256 tokenId = tokenIds[index];
            if (pendingClaimByToken[tokenId] != claimId) revert ClaimTokenMismatch(claimId, tokenId);
            delete pendingClaimByToken[tokenId];
            emit TradeInSettled(claimId, tokenId);
        }
    }

    function returnClaim(uint256 claimId, address to, uint256[] calldata tokenIds)
        external
        onlyForge
        nonReentrant
    {
        if (to == address(0)) revert InvalidAddress();
        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint256 tokenId = tokenIds[index];
            if (pendingClaimByToken[tokenId] != claimId) revert ClaimTokenMismatch(claimId, tokenId);
            delete pendingClaimByToken[tokenId];
            itemToken.safeTransferFrom(address(this), to, tokenId, 1, "");
            emit TradeInReturned(claimId, to, tokenId);
        }
    }

    function releaseSettledInventory(uint256 tokenId, address to)
        external
        onlyRole(CUSTODY_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert InvalidAddress();
        uint256 pendingClaim = pendingClaimByToken[tokenId];
        if (pendingClaim != 0) revert TokenStillPending(tokenId, pendingClaim);
        itemToken.safeTransferFrom(address(this), to, tokenId, 1, "");
        emit SettledInventoryReleased(tokenId, to);
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes memory data
    ) public override returns (bytes4) {
        if (msg.sender != address(itemToken) || operator != forge || from == address(0) || value != 1 || data.length != 32) {
            revert UnexpectedERC1155Received();
        }

        uint256 claimId = abi.decode(data, (uint256));
        if (claimId == 0) revert UnexpectedERC1155Received();
        uint256 currentClaim = pendingClaimByToken[id];
        if (currentClaim != 0) revert TokenAlreadyPending(id, currentClaim);
        pendingClaimByToken[id] = claimId;
        emit TradeInReceived(claimId, from, id);
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override returns (bytes4) {
        revert UnexpectedERC1155BatchReceived();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
