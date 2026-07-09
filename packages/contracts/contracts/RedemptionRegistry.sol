// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";

contract RedemptionRegistry is AccessControl, ReentrancyGuard, ERC1155Holder {
    enum RedemptionStatus {
        Requested,
        Approved,
        Packed,
        Shipped,
        Completed,
        Cancelled
    }

    bytes32 public constant REDEMPTION_ADMIN_ROLE = keccak256("REDEMPTION_ADMIN_ROLE");

    struct RedemptionRequest {
        address requester;
        uint256 tokenId;
        RedemptionStatus status;
        string trackingRef;
        string reason;
    }

    error InvalidAddress();
    error InventoryTokenNotAnchored(uint256 tokenId);
    error InventoryNotRedeemable(uint256 tokenId);
    error InsufficientTokenBalance(address account, uint256 tokenId);
    error InvalidStatusTransition(uint256 requestId, RedemptionStatus currentStatus, RedemptionStatus nextStatus);
    error EmptyTrackingRef();
    error EmptyCancellationReason();
    error RedemptionRequestNotFound(uint256 requestId);

    event RedemptionRequested(uint256 indexed requestId, address indexed requester, uint256 indexed tokenId);
    event RedemptionStatusUpdated(
        uint256 indexed requestId,
        RedemptionStatus previousStatus,
        RedemptionStatus status
    );
    event RedemptionShipped(uint256 indexed requestId, string trackingRef);
    event RedemptionCancelled(uint256 indexed requestId, string reason);

    ItemToken public immutable itemToken;
    InventoryRegistry public immutable inventoryRegistry;
    uint256 public nextRequestId = 1;

    mapping(uint256 requestId => RedemptionRequest request) public requests;

    constructor(ItemToken itemToken_, InventoryRegistry inventoryRegistry_) {
        if (address(itemToken_) == address(0) || address(inventoryRegistry_) == address(0)) {
            revert InvalidAddress();
        }

        itemToken = itemToken_;
        inventoryRegistry = inventoryRegistry_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function requestRedemption(uint256 tokenId) external nonReentrant returns (uint256 requestId) {
        InventoryRegistry.InventoryRecord memory record = inventoryRegistry.getInventoryByTokenId(tokenId);
        if (!record.redeemable) {
            revert InventoryNotRedeemable(tokenId);
        }

        if (itemToken.balanceOf(msg.sender, tokenId) < 1) {
            revert InsufficientTokenBalance(msg.sender, tokenId);
        }

        requestId = nextRequestId++;
        requests[requestId] = RedemptionRequest({
            requester: msg.sender,
            tokenId: tokenId,
            status: RedemptionStatus.Requested,
            trackingRef: "",
            reason: ""
        });

        itemToken.safeTransferFrom(msg.sender, address(this), tokenId, 1, "");

        emit RedemptionRequested(requestId, msg.sender, tokenId);
    }

    function approve(uint256 requestId) external onlyRole(REDEMPTION_ADMIN_ROLE) {
        RedemptionRequest storage request = _requestFor(requestId);
        _setStatus(requestId, request, RedemptionStatus.Requested, RedemptionStatus.Approved);
    }

    function markPacked(uint256 requestId) external onlyRole(REDEMPTION_ADMIN_ROLE) {
        RedemptionRequest storage request = _requestFor(requestId);
        _setStatus(requestId, request, RedemptionStatus.Approved, RedemptionStatus.Packed);
    }

    function markShipped(
        uint256 requestId,
        string calldata trackingRef
    ) external onlyRole(REDEMPTION_ADMIN_ROLE) {
        if (bytes(trackingRef).length == 0) {
            revert EmptyTrackingRef();
        }

        RedemptionRequest storage request = _requestFor(requestId);
        _setStatus(requestId, request, RedemptionStatus.Packed, RedemptionStatus.Shipped);
        request.trackingRef = trackingRef;

        emit RedemptionShipped(requestId, trackingRef);
    }

    function complete(uint256 requestId) external nonReentrant onlyRole(REDEMPTION_ADMIN_ROLE) {
        RedemptionRequest storage request = _requestFor(requestId);
        _setStatus(requestId, request, RedemptionStatus.Shipped, RedemptionStatus.Completed);

        itemToken.burn(address(this), request.tokenId, 1);
    }

    function cancel(
        uint256 requestId,
        string calldata reason
    ) external nonReentrant onlyRole(REDEMPTION_ADMIN_ROLE) {
        if (bytes(reason).length == 0) {
            revert EmptyCancellationReason();
        }

        RedemptionRequest storage request = _requestFor(requestId);
        RedemptionStatus previousStatus = request.status;
        if (previousStatus == RedemptionStatus.Completed || previousStatus == RedemptionStatus.Cancelled) {
            revert InvalidStatusTransition(requestId, previousStatus, RedemptionStatus.Cancelled);
        }

        request.status = RedemptionStatus.Cancelled;
        request.reason = reason;

        itemToken.safeTransferFrom(address(this), request.requester, request.tokenId, 1, "");

        emit RedemptionStatusUpdated(requestId, previousStatus, RedemptionStatus.Cancelled);
        emit RedemptionCancelled(requestId, reason);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _requestFor(uint256 requestId) private view returns (RedemptionRequest storage) {
        RedemptionRequest storage request = requests[requestId];
        if (request.requester == address(0)) {
            revert RedemptionRequestNotFound(requestId);
        }

        return request;
    }

    function _setStatus(
        uint256 requestId,
        RedemptionRequest storage request,
        RedemptionStatus expectedStatus,
        RedemptionStatus nextStatus
    ) private {
        RedemptionStatus previousStatus = request.status;
        if (previousStatus != expectedStatus) {
            revert InvalidStatusTransition(requestId, previousStatus, nextStatus);
        }

        request.status = nextStatus;

        emit RedemptionStatusUpdated(requestId, previousStatus, nextStatus);
    }
}
