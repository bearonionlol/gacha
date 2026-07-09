// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";
import {IRandomnessProvider} from "./randomness/IRandomnessProvider.sol";

contract PackSale is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    bytes32 public constant DROP_ADMIN_ROLE = keccak256("DROP_ADMIN_ROLE");
    uint256 public constant REFUND_TIMEOUT = 1 days;

    struct CreateDropParams {
        string name;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        uint256 maxSupply;
        string[] inventoryIds;
        string[] metadataUris;
    }

    struct Drop {
        string name;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        uint256 maxSupply;
        uint256 sold;
        uint256 nextPurchasePosition;
        uint256 nextRevealPosition;
        uint256 pendingPurchases;
        string[] inventoryIds;
        string[] metadataUris;
        bool exists;
    }

    struct Purchase {
        address buyer;
        uint256 dropId;
        bytes32 requestId;
        uint256 price;
        uint256 position;
        uint256 purchasedAt;
        uint256 revealedTokenId;
        bool revealed;
        bool tokenClaimed;
        bool refunded;
        bool exists;
    }

    error InvalidAddress();
    error InvalidDropParams();
    error UnanchoredInventory(string inventoryId);
    error InventoryAlreadyTokenized(string inventoryId);
    error DuplicateInventory(string inventoryId);
    error InventoryAlreadyReserved(string inventoryId);
    error DropNotFound(uint256 dropId);
    error PurchaseNotFound(uint256 purchaseId);
    error InactiveSale(uint256 dropId);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error SoldOut(uint256 dropId);
    error NoInventoryRemaining(uint256 dropId);
    error RandomnessNotReady(bytes32 requestId);
    error UnauthorizedReveal(uint256 purchaseId, address caller);
    error PurchaseAlreadyRevealed(uint256 purchaseId);
    error RevealOrderBlocked(uint256 purchaseId, uint256 expectedPosition, uint256 actualPosition);
    error UnauthorizedClaim(uint256 purchaseId, address caller);
    error RevealedTokenNotClaimable(uint256 purchaseId);
    error PurchaseAlreadyRefunded(uint256 purchaseId);
    error RefundNotAvailable(uint256 purchaseId);
    error RefundRandomnessReady(uint256 purchaseId);
    error RefundWithdrawalUnavailable(address account);
    error TreasuryCreditUnavailable();
    error DropStillActive(uint256 dropId);
    error PendingPurchasesRemaining(uint256 dropId);
    error TransferFailed(address to, uint256 amount);

    event DropCreated(
        uint256 indexed dropId,
        string name,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        uint256 maxSupply,
        uint256 inventoryCount
    );
    event PackPurchased(
        uint256 indexed purchaseId,
        uint256 indexed dropId,
        address indexed buyer,
        bytes32 requestId,
        uint256 price
    );
    event PackRevealed(
        uint256 indexed purchaseId,
        uint256 indexed dropId,
        address indexed buyer,
        string inventoryId,
        uint256 tokenId
    );
    event PackRefunded(uint256 indexed purchaseId, uint256 indexed dropId, address indexed buyer, uint256 price);
    event RevealedTokenClaimed(uint256 indexed purchaseId, address indexed buyer, address indexed to, uint256 tokenId);
    event RefundWithdrawn(address indexed account, uint256 amount);
    event TreasuryCreditRecorded(address indexed treasury, uint256 amount, uint256 totalCredit);
    event TreasuryCreditWithdrawn(address indexed caller, address indexed to, uint256 amount);
    event DropClosed(uint256 indexed dropId, uint256 releasedInventory);

    InventoryRegistry public immutable inventoryRegistry;
    ItemToken public immutable itemToken;
    IRandomnessProvider public immutable randomnessProvider;
    address payable public immutable treasury;

    uint256 public nextDropId = 1;
    uint256 public nextPurchaseId = 1;
    uint256 public treasuryCredit;

    mapping(uint256 dropId => Drop drop) private _drops;
    mapping(uint256 purchaseId => Purchase purchase) private _purchases;
    mapping(uint256 dropId => mapping(uint256 position => uint256 purchaseId)) private _purchaseIdByDropPosition;
    mapping(bytes32 inventoryKey => bool reserved) private _reservedInventory;
    mapping(address account => uint256 amount) public refundCredit;

    constructor(
        InventoryRegistry inventoryRegistry_,
        ItemToken itemToken_,
        IRandomnessProvider randomnessProvider_,
        address payable treasury_
    ) {
        if (
            address(inventoryRegistry_) == address(0) || address(itemToken_) == address(0)
                || address(randomnessProvider_) == address(0) || treasury_ == address(0)
        ) {
            revert InvalidAddress();
        }

        inventoryRegistry = inventoryRegistry_;
        itemToken = itemToken_;
        randomnessProvider = randomnessProvider_;
        treasury = treasury_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createDrop(CreateDropParams calldata params) external onlyRole(DROP_ADMIN_ROLE) returns (uint256 dropId) {
        uint256 inventoryCount = params.inventoryIds.length;
        if (
            bytes(params.name).length == 0 || params.price == 0 || params.startTime >= params.endTime
                || params.maxSupply == 0 || inventoryCount == 0 || inventoryCount != params.metadataUris.length
                || params.maxSupply > inventoryCount
        ) {
            revert InvalidDropParams();
        }

        for (uint256 index = 0; index < inventoryCount; index++) {
            string calldata inventoryId = params.inventoryIds[index];
            bytes32 inventoryKey = _inventoryKey(inventoryId);

            for (uint256 duplicateIndex = index + 1; duplicateIndex < inventoryCount; duplicateIndex++) {
                if (inventoryKey == _inventoryKey(params.inventoryIds[duplicateIndex])) {
                    revert DuplicateInventory(inventoryId);
                }
            }

            InventoryRegistry.InventoryRecord memory record;
            try inventoryRegistry.getInventory(inventoryId) returns (InventoryRegistry.InventoryRecord memory anchoredRecord) {
                record = anchoredRecord;
            }
            catch {
                revert UnanchoredInventory(inventoryId);
            }

            if (record.tokenized) {
                revert InventoryAlreadyTokenized(inventoryId);
            }

            if (_reservedInventory[inventoryKey]) {
                revert InventoryAlreadyReserved(inventoryId);
            }
        }

        dropId = nextDropId++;
        Drop storage drop = _drops[dropId];
        drop.name = params.name;
        drop.price = params.price;
        drop.startTime = params.startTime;
        drop.endTime = params.endTime;
        drop.maxSupply = params.maxSupply;
        drop.exists = true;

        for (uint256 index = 0; index < inventoryCount; index++) {
            _reservedInventory[_inventoryKey(params.inventoryIds[index])] = true;
            drop.inventoryIds.push(params.inventoryIds[index]);
            drop.metadataUris.push(params.metadataUris[index]);
        }

        emit DropCreated(
            dropId,
            params.name,
            params.price,
            params.startTime,
            params.endTime,
            params.maxSupply,
            inventoryCount
        );
    }

    function purchase(uint256 dropId) external payable nonReentrant whenNotPaused returns (uint256 purchaseId) {
        Drop storage drop = _dropFor(dropId);

        if (msg.value != drop.price) {
            revert ExactPaymentRequired(drop.price, msg.value);
        }

        if (block.timestamp < drop.startTime || block.timestamp > drop.endTime) {
            revert InactiveSale(dropId);
        }

        if (drop.sold >= drop.maxSupply) {
            revert SoldOut(dropId);
        }

        if (drop.inventoryIds.length == 0) {
            revert NoInventoryRemaining(dropId);
        }

        purchaseId = nextPurchaseId++;
        bytes32 requestId = keccak256(abi.encode(address(this), purchaseId, msg.sender, block.chainid));
        uint256 position = drop.nextPurchasePosition;

        drop.sold += 1;
        drop.nextPurchasePosition += 1;
        drop.pendingPurchases += 1;
        _purchaseIdByDropPosition[dropId][position] = purchaseId;
        _purchases[purchaseId] = Purchase({
            buyer: msg.sender,
            dropId: dropId,
            requestId: requestId,
            price: msg.value,
            position: position,
            purchasedAt: block.timestamp,
            revealedTokenId: 0,
            revealed: false,
            tokenClaimed: false,
            refunded: false,
            exists: true
        });

        randomnessProvider.requestRandomness(requestId);

        emit PackPurchased(purchaseId, dropId, msg.sender, requestId, msg.value);
    }

    function reveal(uint256 purchaseId) external nonReentrant returns (uint256 tokenId) {
        Purchase storage purchaseRecord = _purchaseFor(purchaseId);

        if (
            purchaseRecord.buyer != msg.sender
                && block.timestamp < purchaseRecord.purchasedAt + REFUND_TIMEOUT
        ) {
            revert UnauthorizedReveal(purchaseId, msg.sender);
        }

        if (purchaseRecord.refunded) {
            revert PurchaseAlreadyRefunded(purchaseId);
        }

        if (purchaseRecord.revealed) {
            revert PurchaseAlreadyRevealed(purchaseId);
        }

        Drop storage drop = _dropFor(purchaseRecord.dropId);
        if (purchaseRecord.position != drop.nextRevealPosition) {
            revert RevealOrderBlocked(purchaseId, drop.nextRevealPosition, purchaseRecord.position);
        }

        (bool ready, uint256 randomness) = randomnessProvider.readRandomness(purchaseRecord.requestId);
        if (!ready) {
            revert RandomnessNotReady(purchaseRecord.requestId);
        }

        uint256 inventoryCount = drop.inventoryIds.length;
        if (inventoryCount == 0) {
            revert NoInventoryRemaining(purchaseRecord.dropId);
        }

        uint256 selectedIndex = randomness % inventoryCount;
        string memory inventoryId = drop.inventoryIds[selectedIndex];
        string memory metadataUri = drop.metadataUris[selectedIndex];
        tokenId = inventoryRegistry.derivePhysicalTokenId(inventoryId);

        uint256 lastIndex = inventoryCount - 1;
        if (selectedIndex != lastIndex) {
            drop.inventoryIds[selectedIndex] = drop.inventoryIds[lastIndex];
            drop.metadataUris[selectedIndex] = drop.metadataUris[lastIndex];
        }
        drop.inventoryIds.pop();
        drop.metadataUris.pop();

        purchaseRecord.revealed = true;
        purchaseRecord.revealedTokenId = tokenId;
        inventoryRegistry.markTokenized(inventoryId, purchaseRecord.buyer);
        delete _reservedInventory[_inventoryKey(inventoryId)];
        itemToken.mintInventoryItem(address(this), tokenId, inventoryId, metadataUri);
        drop.pendingPurchases -= 1;
        _advanceRevealCursor(drop, purchaseRecord.dropId);
        treasuryCredit += purchaseRecord.price;
        emit TreasuryCreditRecorded(treasury, purchaseRecord.price, treasuryCredit);
        _tryAutoClaimRevealedToken(purchaseId, purchaseRecord);

        emit PackRevealed(purchaseId, purchaseRecord.dropId, purchaseRecord.buyer, inventoryId, tokenId);
    }

    function claimRevealedTokenTo(uint256 purchaseId, address to) external nonReentrant {
        Purchase storage purchaseRecord = _purchaseFor(purchaseId);

        if (purchaseRecord.buyer != msg.sender) {
            revert UnauthorizedClaim(purchaseId, msg.sender);
        }

        _claimRevealedTokenTo(purchaseId, purchaseRecord, to);
    }

    function refundExpiredPurchase(uint256 purchaseId) external nonReentrant {
        Purchase storage purchaseRecord = _purchaseFor(purchaseId);

        if (purchaseRecord.refunded) {
            revert PurchaseAlreadyRefunded(purchaseId);
        }

        if (purchaseRecord.revealed) {
            revert PurchaseAlreadyRevealed(purchaseId);
        }

        (bool ready,) = randomnessProvider.readRandomness(purchaseRecord.requestId);
        if (ready) {
            revert RefundRandomnessReady(purchaseId);
        }

        if (block.timestamp < purchaseRecord.purchasedAt + REFUND_TIMEOUT) {
            revert RefundNotAvailable(purchaseId);
        }

        Drop storage drop = _dropFor(purchaseRecord.dropId);
        purchaseRecord.refunded = true;
        drop.sold -= 1;
        drop.pendingPurchases -= 1;

        if (purchaseRecord.position == drop.nextRevealPosition) {
            _advanceRevealCursor(drop, purchaseRecord.dropId);
        }

        refundCredit[purchaseRecord.buyer] += purchaseRecord.price;

        emit PackRefunded(purchaseId, purchaseRecord.dropId, purchaseRecord.buyer, purchaseRecord.price);
    }

    function withdrawRefund() external nonReentrant {
        uint256 amount = refundCredit[msg.sender];
        if (amount == 0) {
            revert RefundWithdrawalUnavailable(msg.sender);
        }

        refundCredit[msg.sender] = 0;
        _sendNative(payable(msg.sender), amount);

        emit RefundWithdrawn(msg.sender, amount);
    }

    function withdrawTreasuryCredit() external nonReentrant {
        _withdrawTreasuryCreditTo(treasury);
    }

    function withdrawTreasuryCreditTo(address payable to) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        _withdrawTreasuryCreditTo(to);
    }

    function closeDrop(uint256 dropId) external onlyRole(DROP_ADMIN_ROLE) {
        Drop storage drop = _dropFor(dropId);

        if (block.timestamp <= drop.endTime) {
            revert DropStillActive(dropId);
        }

        if (drop.pendingPurchases != 0) {
            revert PendingPurchasesRemaining(dropId);
        }

        uint256 releasedInventory = drop.inventoryIds.length;
        for (uint256 index = 0; index < releasedInventory; index++) {
            delete _reservedInventory[_inventoryKey(drop.inventoryIds[index])];
        }

        delete drop.inventoryIds;
        delete drop.metadataUris;

        emit DropClosed(dropId, releasedInventory);
    }

    function remainingInventory(uint256 dropId) external view returns (uint256) {
        return _dropFor(dropId).inventoryIds.length;
    }

    function pause() external onlyRole(DROP_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DROP_ADMIN_ROLE) {
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

    function _dropFor(uint256 dropId) private view returns (Drop storage) {
        Drop storage drop = _drops[dropId];
        if (!drop.exists) {
            revert DropNotFound(dropId);
        }

        return drop;
    }

    function _purchaseFor(uint256 purchaseId) private view returns (Purchase storage) {
        Purchase storage purchaseRecord = _purchases[purchaseId];
        if (!purchaseRecord.exists) {
            revert PurchaseNotFound(purchaseId);
        }

        return purchaseRecord;
    }

    function _advanceRevealCursor(Drop storage drop, uint256 dropId) private {
        drop.nextRevealPosition += 1;

        while (drop.nextRevealPosition < drop.nextPurchasePosition) {
            uint256 purchaseIdAtPosition = _purchaseIdByDropPosition[dropId][drop.nextRevealPosition];
            if (purchaseIdAtPosition == 0 || !_purchases[purchaseIdAtPosition].refunded) {
                break;
            }

            drop.nextRevealPosition += 1;
        }
    }

    function _inventoryKey(string memory inventoryId) private pure returns (bytes32) {
        return keccak256(bytes(inventoryId));
    }

    function _tryAutoClaimRevealedToken(uint256 purchaseId, Purchase storage purchaseRecord) private {
        if (!_canReceiveERC1155(purchaseRecord.buyer)) {
            return;
        }

        try itemToken.safeTransferFrom(address(this), purchaseRecord.buyer, purchaseRecord.revealedTokenId, 1, "") {
            purchaseRecord.tokenClaimed = true;
            emit RevealedTokenClaimed(
                purchaseId,
                purchaseRecord.buyer,
                purchaseRecord.buyer,
                purchaseRecord.revealedTokenId
            );
        } catch {}
    }

    function _claimRevealedTokenTo(uint256 purchaseId, Purchase storage purchaseRecord, address to) private {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (!purchaseRecord.revealed || purchaseRecord.refunded || purchaseRecord.tokenClaimed) {
            revert RevealedTokenNotClaimable(purchaseId);
        }

        uint256 tokenId = purchaseRecord.revealedTokenId;
        purchaseRecord.tokenClaimed = true;
        itemToken.safeTransferFrom(address(this), to, tokenId, 1, "");

        emit RevealedTokenClaimed(purchaseId, purchaseRecord.buyer, to, tokenId);
    }

    function _canReceiveERC1155(address account) private view returns (bool) {
        return account.code.length == 0
            || ERC165Checker.supportsInterface(account, type(IERC1155Receiver).interfaceId);
    }

    function _withdrawTreasuryCreditTo(address payable to) private {
        uint256 amount = treasuryCredit;
        if (amount == 0) {
            revert TreasuryCreditUnavailable();
        }

        treasuryCredit = 0;
        _sendNative(to, amount);

        emit TreasuryCreditWithdrawn(msg.sender, to, amount);
    }

    function _sendNative(address payable to, uint256 amount) private {
        (bool success,) = to.call{value: amount}("");
        if (!success) {
            revert TransferFailed(to, amount);
        }
    }
}
