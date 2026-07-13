// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ItemToken} from "./ItemToken.sol";

contract BuybackVault is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    bytes32 public constant BUYBACK_ADMIN_ROLE = keccak256("BUYBACK_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Quote {
        uint256 price;
        bool active;
    }

    error InvalidAddress();
    error InvalidQuotePrice(uint256 tokenId);
    error QuoteInactive(uint256 tokenId);
    error InvalidAmount();
    error InsufficientVaultBalance(uint256 required, uint256 available);
    error PayoutUnavailable(address account);
    error TransferFailed(address to, uint256 amount);

    event QuoteSet(uint256 indexed tokenId, uint256 price, bool active);
    event BuybackAccepted(address indexed seller, uint256 indexed tokenId, uint256 amount, uint256 payout);
    event PayoutWithdrawn(address indexed account, address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed to, uint256 indexed tokenId, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);

    ItemToken public immutable itemToken;
    uint256 public totalPayoutCredit;

    mapping(uint256 tokenId => Quote quote) public quotes;
    mapping(address account => uint256 amount) public payoutCredit;

    constructor(ItemToken itemToken_) {
        if (address(itemToken_) == address(0)) {
            revert InvalidAddress();
        }

        itemToken = itemToken_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    receive() external payable {}

    function setQuote(uint256 tokenId, uint256 price, bool active) external onlyRole(BUYBACK_ADMIN_ROLE) {
        if (active && price == 0) {
            revert InvalidQuotePrice(tokenId);
        }

        quotes[tokenId] = Quote({price: price, active: active});

        emit QuoteSet(tokenId, price, active);
    }

    function acceptQuote(uint256 tokenId, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) {
            revert InvalidAmount();
        }

        Quote memory quote = quotes[tokenId];
        if (!quote.active || quote.price == 0) {
            revert QuoteInactive(tokenId);
        }

        uint256 payout = quote.price * amount;
        uint256 available = _availableNativeBalance();
        if (available < payout) {
            revert InsufficientVaultBalance(payout, available);
        }

        itemToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        payoutCredit[msg.sender] += payout;
        totalPayoutCredit += payout;

        emit BuybackAccepted(msg.sender, tokenId, amount, payout);
    }

    function withdrawPayout() external nonReentrant {
        _withdrawPayoutTo(payable(msg.sender));
    }

    function withdrawPayoutTo(address payable to) external nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        _withdrawPayoutTo(to);
    }

    function withdrawToken(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyRole(BUYBACK_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        itemToken.safeTransferFrom(address(this), to, tokenId, amount, "");

        emit TokenWithdrawn(to, tokenId, amount);
    }

    function withdrawNative(
        address payable to,
        uint256 amount
    ) external onlyRole(BUYBACK_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        uint256 available = _availableNativeBalance();
        if (available < amount) {
            revert InsufficientVaultBalance(amount, available);
        }

        _sendNative(to, amount);

        emit NativeWithdrawn(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _withdrawPayoutTo(address payable to) private {
        uint256 amount = payoutCredit[msg.sender];
        if (amount == 0) {
            revert PayoutUnavailable(msg.sender);
        }

        payoutCredit[msg.sender] = 0;
        totalPayoutCredit -= amount;
        _sendNative(to, amount);

        emit PayoutWithdrawn(msg.sender, to, amount);
    }

    function _availableNativeBalance() private view returns (uint256) {
        uint256 balance = address(this).balance;
        if (balance <= totalPayoutCredit) {
            return 0;
        }

        return balance - totalPayoutCredit;
    }

    function _sendNative(address payable to, uint256 amount) private {
        (bool success,) = to.call{value: amount}("");
        if (!success) {
            revert TransferFailed(to, amount);
        }
    }
}
