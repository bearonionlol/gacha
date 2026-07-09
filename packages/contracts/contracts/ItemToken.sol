// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ItemToken is ERC1155, ERC1155Supply, AccessControl, Pausable {
    enum TokenKind {
        Unknown,
        Inventory,
        Game
    }

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error ZeroRecipient();
    error EmptyInventoryId();
    error EmptyTokenURI();
    error InventoryTokenIdMismatch(string inventoryId, uint256 expectedTokenId, uint256 actualTokenId);
    error InventoryTokenAlreadyMinted(uint256 tokenId);
    error TokenKindConflict(uint256 tokenId);
    error InvalidAmount();
    error BurnNotApproved(address owner);

    mapping(uint256 tokenId => string tokenUri) private _tokenUris;
    mapping(uint256 tokenId => bool minted) private _inventoryTokenMinted;
    mapping(uint256 tokenId => TokenKind kind) private _tokenKinds;

    constructor() ERC1155("ipfs://gacha/items/{id}.json") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function mintInventoryItem(
        address to,
        uint256 tokenId,
        string calldata inventoryId,
        string calldata tokenUri
    ) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) {
            revert ZeroRecipient();
        }

        if (bytes(inventoryId).length == 0) {
            revert EmptyInventoryId();
        }

        uint256 expectedTokenId = _derivePhysicalTokenId(inventoryId);
        if (tokenId != expectedTokenId) {
            revert InventoryTokenIdMismatch(inventoryId, expectedTokenId, tokenId);
        }

        if (_tokenKinds[tokenId] == TokenKind.Game) {
            revert TokenKindConflict(tokenId);
        }

        if (_inventoryTokenMinted[tokenId] || totalSupply(tokenId) != 0) {
            revert InventoryTokenAlreadyMinted(tokenId);
        }

        _inventoryTokenMinted[tokenId] = true;
        _tokenKinds[tokenId] = TokenKind.Inventory;
        _setTokenURIIfEmpty(tokenId, tokenUri);
        _mint(to, tokenId, 1, "");
    }

    function mintGameItem(
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenUri
    ) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) {
            revert ZeroRecipient();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        TokenKind kind = _tokenKinds[tokenId];
        if (kind == TokenKind.Inventory) {
            revert TokenKindConflict(tokenId);
        }

        if (kind == TokenKind.Unknown) {
            _tokenKinds[tokenId] = TokenKind.Game;
        }

        _setTokenURIIfEmpty(tokenId, tokenUri);
        _mint(to, tokenId, amount, "");
    }

    function burn(address from, uint256 tokenId, uint256 amount) external onlyRole(BURNER_ROLE) {
        if (from != _msgSender() && !isApprovedForAll(from, _msgSender())) {
            revert BurnNotApproved(from);
        }

        _burn(from, tokenId, amount);
    }

    function setTokenURI(uint256 tokenId, string calldata tokenUri) external onlyRole(URI_SETTER_ROLE) {
        if (bytes(tokenUri).length == 0) {
            revert EmptyTokenURI();
        }

        _tokenUris[tokenId] = tokenUri;
        emit URI(tokenUri, tokenId);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function tokenKind(uint256 tokenId) external view returns (TokenKind) {
        return _tokenKinds[tokenId];
    }

    function hasCustomURI(uint256 tokenId) external view returns (bool) {
        return bytes(_tokenUris[tokenId]).length != 0;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenUri = _tokenUris[tokenId];

        if (bytes(tokenUri).length != 0) {
            return tokenUri;
        }

        return super.uri(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) whenNotPaused {
        super._update(from, to, ids, values);
    }

    function _setTokenURIIfEmpty(uint256 tokenId, string calldata tokenUri) private {
        if (bytes(tokenUri).length != 0 && bytes(_tokenUris[tokenId]).length == 0) {
            _tokenUris[tokenId] = tokenUri;
            emit URI(tokenUri, tokenId);
        }
    }

    function _derivePhysicalTokenId(string calldata inventoryId) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("inventory:", inventoryId)));
    }
}
