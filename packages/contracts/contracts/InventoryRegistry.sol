// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract InventoryRegistry is AccessControl {
    bytes32 public constant INVENTORY_ADMIN_ROLE = keccak256("INVENTORY_ADMIN_ROLE");
    bytes32 public constant TOKENIZER_ROLE = keccak256("TOKENIZER_ROLE");
    uint256 public constant GAME_TOKEN_ID_MAX = type(uint128).max;

    struct InventoryRecord {
        string inventoryId;
        bytes32 inventoryHash;
        string metadataUri;
        bool redeemable;
        bool grailProtected;
        uint256 tokenId;
        bool tokenized;
        address owner;
    }

    error EmptyInventoryId();
    error ZeroInventoryHash();
    error InventoryAlreadyAnchored(string inventoryId);
    error InventoryNotAnchored(string inventoryId);
    error InventoryTokenNotAnchored(uint256 tokenId);
    error InventoryAlreadyTokenized(string inventoryId);
    error InvalidPhysicalTokenId(uint256 tokenId);
    error ZeroOwner();

    event InventoryAnchored(
        string inventoryId,
        bytes32 inventoryHash,
        uint256 tokenId,
        string metadataUri,
        bool redeemable,
        bool grailProtected
    );
    event InventoryTokenized(string inventoryId, uint256 tokenId, address owner);

    mapping(bytes32 inventoryKey => InventoryRecord record) private _inventoryRecords;
    mapping(uint256 tokenId => bytes32 inventoryKey) private _inventoryKeysByTokenId;
    mapping(uint256 tokenId => bool grailProtected) private _grailProtectedTokens;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function derivePhysicalTokenId(string memory inventoryId) public pure returns (uint256) {
        _requireInventoryId(inventoryId);

        return uint256(keccak256(abi.encodePacked("inventory:", inventoryId)));
    }

    function validatePhysicalTokenId(uint256 tokenId) public pure {
        if (tokenId <= GAME_TOKEN_ID_MAX) {
            revert InvalidPhysicalTokenId(tokenId);
        }
    }

    function anchorInventory(
        string calldata inventoryId,
        bytes32 inventoryHash,
        string calldata metadataUri,
        bool redeemable,
        bool grailProtected
    ) external onlyRole(INVENTORY_ADMIN_ROLE) {
        _requireInventoryId(inventoryId);

        if (inventoryHash == bytes32(0)) {
            revert ZeroInventoryHash();
        }

        bytes32 key = _inventoryKey(inventoryId);
        if (_inventoryRecords[key].inventoryHash != bytes32(0)) {
            revert InventoryAlreadyAnchored(inventoryId);
        }

        uint256 tokenId = derivePhysicalTokenId(inventoryId);
        validatePhysicalTokenId(tokenId);

        _inventoryRecords[key] = InventoryRecord({
            inventoryId: inventoryId,
            inventoryHash: inventoryHash,
            metadataUri: metadataUri,
            redeemable: redeemable,
            grailProtected: grailProtected,
            tokenId: tokenId,
            tokenized: false,
            owner: address(0)
        });
        _inventoryKeysByTokenId[tokenId] = key;
        _grailProtectedTokens[tokenId] = grailProtected;

        emit InventoryAnchored(inventoryId, inventoryHash, tokenId, metadataUri, redeemable, grailProtected);
    }

    function markTokenized(string calldata inventoryId, address owner) external onlyRole(TOKENIZER_ROLE) {
        _requireInventoryId(inventoryId);

        if (owner == address(0)) {
            revert ZeroOwner();
        }

        InventoryRecord storage record = _recordFor(inventoryId);
        if (record.tokenized) {
            revert InventoryAlreadyTokenized(inventoryId);
        }

        record.tokenized = true;
        record.owner = owner;

        emit InventoryTokenized(inventoryId, record.tokenId, owner);
    }

    function getInventory(string calldata inventoryId) external view returns (InventoryRecord memory) {
        _requireInventoryId(inventoryId);

        return _recordFor(inventoryId);
    }

    function getInventoryByTokenId(uint256 tokenId) external view returns (InventoryRecord memory) {
        bytes32 key = _inventoryKeysByTokenId[tokenId];
        if (key == bytes32(0)) {
            revert InventoryTokenNotAnchored(tokenId);
        }

        return _inventoryRecords[key];
    }

    function isGrailProtectedToken(uint256 tokenId) external view returns (bool) {
        return _grailProtectedTokens[tokenId];
    }

    function _recordFor(string memory inventoryId) private view returns (InventoryRecord storage) {
        bytes32 key = _inventoryKey(inventoryId);
        InventoryRecord storage record = _inventoryRecords[key];

        if (record.inventoryHash == bytes32(0)) {
            revert InventoryNotAnchored(inventoryId);
        }

        return record;
    }

    function _inventoryKey(string memory inventoryId) private pure returns (bytes32) {
        return keccak256(bytes(inventoryId));
    }

    function _requireInventoryId(string memory inventoryId) private pure {
        if (bytes(inventoryId).length == 0) {
            revert EmptyInventoryId();
        }
    }
}
