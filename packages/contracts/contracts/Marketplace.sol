// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ItemToken} from "./ItemToken.sol";

contract Marketplace is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    bytes32 public constant MARKET_ADMIN_ROLE = keccak256("MARKET_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint96 public constant MAX_FEE_BPS = 1000;
    uint96 public constant FEE_DENOMINATOR = 10_000;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 amount;
        uint256 price;
        bool active;
        bool sold;
        bool cancelled;
    }

    error InvalidAddress();
    error InvalidListingAmount();
    error InvalidListingPrice();
    error ListingNotActive(uint256 listingId);
    error UnauthorizedListingCancel(uint256 listingId, address caller);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error FeeTooHigh(uint96 feeBps);
    error ProceedsUnavailable(address account);
    error TransferFailed(address to, uint256 amount);

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 price
    );
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee);
    event ProceedsWithdrawn(address indexed account, address indexed to, uint256 amount);
    event FeeBpsUpdated(uint96 feeBps);
    event TreasuryUpdated(address indexed treasury);

    ItemToken public immutable itemToken;
    address payable public treasury;
    uint96 public feeBps;
    uint256 public nextListingId = 1;

    mapping(uint256 listingId => Listing listing) public listings;
    mapping(address account => uint256 amount) public proceedsCredit;

    constructor(ItemToken itemToken_, address treasury_) {
        if (address(itemToken_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }

        itemToken = itemToken_;
        treasury = payable(treasury_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function list(
        uint256 tokenId,
        uint256 amount,
        uint256 price
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        if (amount == 0) {
            revert InvalidListingAmount();
        }

        if (price == 0) {
            revert InvalidListingPrice();
        }

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            amount: amount,
            price: price,
            active: true,
            sold: false,
            cancelled: false
        });

        itemToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        emit ListingCreated(listingId, msg.sender, tokenId, amount, price);
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = _activeListingFor(listingId);

        if (listing.seller != msg.sender) {
            revert UnauthorizedListingCancel(listingId, msg.sender);
        }

        listing.active = false;
        listing.cancelled = true;
        itemToken.safeTransferFrom(address(this), listing.seller, listing.tokenId, listing.amount, "");

        emit ListingCancelled(listingId, msg.sender);
    }

    function buy(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = _activeListingFor(listingId);

        if (msg.value != listing.price) {
            revert ExactPaymentRequired(listing.price, msg.value);
        }

        listing.active = false;
        listing.sold = true;

        uint256 fee = (msg.value * feeBps) / FEE_DENOMINATOR;
        uint256 sellerProceeds = msg.value - fee;

        proceedsCredit[listing.seller] += sellerProceeds;
        proceedsCredit[treasury] += fee;

        itemToken.safeTransferFrom(address(this), msg.sender, listing.tokenId, listing.amount, "");

        emit ListingSold(listingId, msg.sender, msg.value, fee);
    }

    function withdrawProceeds() external nonReentrant {
        _withdrawProceedsTo(payable(msg.sender));
    }

    function withdrawProceedsTo(address payable to) external nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        _withdrawProceedsTo(to);
    }

    function setFeeBps(uint96 feeBps_) external onlyRole(MARKET_ADMIN_ROLE) {
        if (feeBps_ > MAX_FEE_BPS) {
            revert FeeTooHigh(feeBps_);
        }

        feeBps = feeBps_;

        emit FeeBpsUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyRole(MARKET_ADMIN_ROLE) {
        if (treasury_ == address(0)) {
            revert InvalidAddress();
        }

        treasury = payable(treasury_);

        emit TreasuryUpdated(treasury_);
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

    function _activeListingFor(uint256 listingId) private view returns (Listing storage) {
        Listing storage listing = listings[listingId];
        if (!listing.active) {
            revert ListingNotActive(listingId);
        }

        return listing;
    }

    function _withdrawProceedsTo(address payable to) private {
        uint256 amount = proceedsCredit[msg.sender];
        if (amount == 0) {
            revert ProceedsUnavailable(msg.sender);
        }

        proceedsCredit[msg.sender] = 0;
        _sendNative(to, amount);

        emit ProceedsWithdrawn(msg.sender, to, amount);
    }

    function _sendNative(address payable to, uint256 amount) private {
        (bool success,) = to.call{value: amount}("");
        if (!success) {
            revert TransferFailed(to, amount);
        }
    }
}
