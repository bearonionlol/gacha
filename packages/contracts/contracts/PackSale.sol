// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";
import {DustLedger} from "./DustLedger.sol";
import {DustRewardPolicy} from "./DustRewardPolicy.sol";
import {IRandomnessProvider} from "./randomness/IRandomnessProvider.sol";

contract PackSale is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    bytes32 public constant DROP_ADMIN_ROLE = keccak256("DROP_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant REFUND_TIMEOUT = 1 days;
    uint256 public constant MAX_BONUS_ITEMS = 4;
    uint256 public constant MAX_DROP_INVENTORY = 128;

    struct CreateDropParams {
        string name;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        uint256 maxSupply;
        uint256 maxPerWallet;
        bytes32 allowlistRoot;
        string[] inventoryIds;
        string[] metadataUris;
        uint256[] bonusTokenIds;
        uint256[] bonusAmounts;
        string[] bonusUris;
    }

    struct Drop {
        string name;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        uint256 maxSupply;
        uint256 maxPerWallet;
        bytes32 allowlistRoot;
        uint256 sold;
        uint256 nextPurchasePosition;
        uint256 nextRevealPosition;
        uint256 pendingPurchases;
        string[] inventoryIds;
        string[] metadataUris;
        uint256[] bonusTokenIds;
        uint256[] bonusAmounts;
        string[] bonusUris;
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

    struct DropSummary {
        string name;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        uint256 maxSupply;
        uint256 maxPerWallet;
        bytes32 allowlistRoot;
        uint256 sold;
        uint256 pendingPurchases;
        uint256 remainingInventory;
    }

    error InvalidAddress();
    error InvalidDropParams();
    error DropInventoryLimitExceeded(uint256 provided, uint256 maximum);
    error InvalidBonusBundle();
    error InvalidBonusToken(uint256 tokenId);
    error DuplicateBonusToken(uint256 tokenId);
    error BonusUriMismatch(uint256 tokenId, string expectedUri, string actualUri);
    error UnanchoredInventory(string inventoryId);
    error InventoryAlreadyTokenized(string inventoryId);
    error DuplicateInventory(string inventoryId);
    error InventoryAlreadyReserved(string inventoryId);
    error DropNotFound(uint256 dropId);
    error PurchaseNotFound(uint256 purchaseId);
    error InactiveSale(uint256 dropId);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error SoldOut(uint256 dropId);
    error WalletPurchaseLimit(uint256 dropId, address buyer, uint256 limit);
    error InvalidAllowlistProof(uint256 dropId, address buyer);
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
    error DustRewardsAlreadyConfigured();
    error DustRewardsNotConfigured();
    error DropDustPolicyMissing(uint256 dropId);
    error DropDustPolicyLocked(uint256 dropId);
    error InactiveDustPolicy(uint256 policyId);

    event DropCreated(
        uint256 indexed dropId,
        string name,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        uint256 maxSupply,
        uint256 maxPerWallet,
        bytes32 allowlistRoot,
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
    event PackBonusMinted(uint256 indexed purchaseId, uint256 indexed tokenId, uint256 amount);
    event PackRefunded(uint256 indexed purchaseId, uint256 indexed dropId, address indexed buyer, uint256 price);
    event RevealedTokenClaimed(uint256 indexed purchaseId, address indexed buyer, address indexed to, uint256 tokenId);
    event RefundWithdrawn(address indexed account, uint256 amount);
    event TreasuryCreditRecorded(address indexed treasury, uint256 amount, uint256 totalCredit);
    event TreasuryCreditWithdrawn(address indexed caller, address indexed to, uint256 amount);
    event DropClosed(uint256 indexed dropId, uint256 releasedInventory);
    event DustRewardsConfigured(address indexed dustLedger, address indexed dustRewardPolicy);
    event DropDustPolicySet(uint256 indexed dropId, uint256 indexed policyId);
    event PackDustAwarded(
        uint256 indexed purchaseId,
        address indexed buyer,
        uint256 indexed policyId,
        uint256[4] amounts
    );

    InventoryRegistry public immutable inventoryRegistry;
    ItemToken public immutable itemToken;
    IRandomnessProvider public immutable randomnessProvider;
    address payable public immutable treasury;
    DustLedger public dustLedger;
    DustRewardPolicy public dustRewardPolicy;

    uint256 public nextDropId = 1;
    uint256 public nextPurchaseId = 1;
    uint256 public treasuryCredit;

    mapping(uint256 dropId => Drop drop) private _drops;
    mapping(uint256 purchaseId => Purchase purchase) private _purchases;
    mapping(uint256 dropId => mapping(uint256 position => uint256 purchaseId)) private _purchaseIdByDropPosition;
    mapping(bytes32 inventoryKey => uint256 dropId) private _reservedDropByInventory;
    mapping(uint256 tokenId => string tokenUri) private _bonusTokenUris;
    mapping(address account => uint256 amount) public refundCredit;
    mapping(uint256 dropId => uint256 policyId) public dropDustPolicyId;
    mapping(uint256 dropId => mapping(address buyer => uint256 purchases)) public purchasesByWallet;

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
        if (inventoryCount > MAX_DROP_INVENTORY) {
            revert DropInventoryLimitExceeded(inventoryCount, MAX_DROP_INVENTORY);
        }
        if (
            bytes(params.name).length == 0 || params.price == 0 || params.startTime >= params.endTime
                || params.maxSupply == 0 || inventoryCount == 0 || inventoryCount != params.metadataUris.length
                || params.maxSupply > inventoryCount || params.maxPerWallet == 0
                || params.maxPerWallet > params.maxSupply
        ) {
            revert InvalidDropParams();
        }

        _validateBonusBundle(params);

        uint256 pendingDropId = nextDropId;
        for (uint256 index = 0; index < inventoryCount; index++) {
            string calldata inventoryId = params.inventoryIds[index];
            bytes32 inventoryKey = _inventoryKey(inventoryId);

            uint256 reservedDropId = _reservedDropByInventory[inventoryKey];
            if (reservedDropId == pendingDropId) {
                revert DuplicateInventory(inventoryId);
            }
            if (reservedDropId != 0) {
                revert InventoryAlreadyReserved(inventoryId);
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

            _reservedDropByInventory[inventoryKey] = pendingDropId;
        }

        dropId = nextDropId++;
        Drop storage drop = _drops[dropId];
        drop.name = params.name;
        drop.price = params.price;
        drop.startTime = params.startTime;
        drop.endTime = params.endTime;
        drop.maxSupply = params.maxSupply;
        drop.maxPerWallet = params.maxPerWallet;
        drop.allowlistRoot = params.allowlistRoot;
        drop.exists = true;

        for (uint256 index = 0; index < inventoryCount; index++) {
            drop.inventoryIds.push(params.inventoryIds[index]);
            drop.metadataUris.push(params.metadataUris[index]);
        }

        for (uint256 index = 0; index < params.bonusTokenIds.length; index++) {
            uint256 tokenId = params.bonusTokenIds[index];
            drop.bonusTokenIds.push(tokenId);
            drop.bonusAmounts.push(params.bonusAmounts[index]);
            drop.bonusUris.push(params.bonusUris[index]);
            if (bytes(_bonusTokenUris[tokenId]).length == 0) {
                _bonusTokenUris[tokenId] = params.bonusUris[index];
            }
        }

        emit DropCreated(
            dropId,
            params.name,
            params.price,
            params.startTime,
            params.endTime,
            params.maxSupply,
            params.maxPerWallet,
            params.allowlistRoot,
            inventoryCount
        );
    }

    function configureDustRewards(DustLedger dustLedger_, DustRewardPolicy dustRewardPolicy_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (address(dustLedger_) == address(0) || address(dustRewardPolicy_) == address(0)) {
            revert InvalidAddress();
        }
        if (address(dustLedger) != address(0) || address(dustRewardPolicy) != address(0)) {
            revert DustRewardsAlreadyConfigured();
        }
        dustLedger = dustLedger_;
        dustRewardPolicy = dustRewardPolicy_;
        emit DustRewardsConfigured(address(dustLedger_), address(dustRewardPolicy_));
    }

    function setDropDustPolicy(uint256 dropId, uint256 policyId) external onlyRole(DROP_ADMIN_ROLE) {
        if (address(dustLedger) == address(0) || address(dustRewardPolicy) == address(0)) {
            revert DustRewardsNotConfigured();
        }
        Drop storage drop = _dropFor(dropId);
        if (drop.sold != 0 || drop.pendingPurchases != 0) revert DropDustPolicyLocked(dropId);
        DustRewardPolicy.Policy memory policy = dustRewardPolicy.getPolicy(policyId);
        if (!policy.active) revert InactiveDustPolicy(policyId);
        dropDustPolicyId[dropId] = policyId;
        emit DropDustPolicySet(dropId, policyId);
    }

    function purchase(uint256 dropId) external payable nonReentrant whenNotPaused returns (uint256 purchaseId) {
        bytes32[] memory emptyProof = new bytes32[](0);
        return _purchase(dropId, emptyProof);
    }

    function purchaseAllowlisted(uint256 dropId, bytes32[] calldata allowlistProof)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 purchaseId)
    {
        return _purchase(dropId, allowlistProof);
    }

    function _purchase(uint256 dropId, bytes32[] memory allowlistProof) private returns (uint256 purchaseId) {
        Drop storage drop = _dropFor(dropId);

        if (
            drop.allowlistRoot != bytes32(0)
                && !MerkleProof.verify(allowlistProof, drop.allowlistRoot, _allowlistLeaf(msg.sender))
        ) {
            revert InvalidAllowlistProof(dropId, msg.sender);
        }

        if (address(dustLedger) != address(0) && dropDustPolicyId[dropId] == 0) {
            revert DropDustPolicyMissing(dropId);
        }

        if (msg.value != drop.price) {
            revert ExactPaymentRequired(drop.price, msg.value);
        }

        if (block.timestamp < drop.startTime || block.timestamp > drop.endTime) {
            revert InactiveSale(dropId);
        }

        if (drop.sold >= drop.maxSupply) {
            revert SoldOut(dropId);
        }

        if (purchasesByWallet[dropId][msg.sender] >= drop.maxPerWallet) {
            revert WalletPurchaseLimit(dropId, msg.sender, drop.maxPerWallet);
        }

        if (drop.inventoryIds.length == 0) {
            revert NoInventoryRemaining(dropId);
        }

        purchaseId = nextPurchaseId++;
        bytes32 requestId = keccak256(abi.encode(address(this), purchaseId, msg.sender, block.chainid));
        uint256 position = drop.nextPurchasePosition;

        drop.sold += 1;
        purchasesByWallet[dropId][msg.sender] += 1;
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
        delete _reservedDropByInventory[_inventoryKey(inventoryId)];
        itemToken.mintInventoryItem(address(this), tokenId, inventoryId, metadataUri);
        _mintBonusBundle(purchaseId, drop);
        _awardDust(purchaseId, purchaseRecord, randomness);
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
        purchasesByWallet[purchaseRecord.dropId][purchaseRecord.buyer] -= 1;
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
            delete _reservedDropByInventory[_inventoryKey(drop.inventoryIds[index])];
        }

        delete drop.inventoryIds;
        delete drop.metadataUris;

        emit DropClosed(dropId, releasedInventory);
    }

    function remainingInventory(uint256 dropId) external view returns (uint256) {
        return _dropFor(dropId).inventoryIds.length;
    }

    function getDropBonus(uint256 dropId)
        external
        view
        returns (uint256[] memory tokenIds, uint256[] memory amounts, string[] memory tokenUris)
    {
        Drop storage drop = _dropFor(dropId);
        return (drop.bonusTokenIds, drop.bonusAmounts, drop.bonusUris);
    }

    function getDropSummary(uint256 dropId) external view returns (DropSummary memory summary) {
        Drop storage drop = _dropFor(dropId);
        summary = DropSummary({
            name: drop.name,
            price: drop.price,
            startTime: drop.startTime,
            endTime: drop.endTime,
            maxSupply: drop.maxSupply,
            maxPerWallet: drop.maxPerWallet,
            allowlistRoot: drop.allowlistRoot,
            sold: drop.sold,
            pendingPurchases: drop.pendingPurchases,
            remainingInventory: drop.inventoryIds.length
        });
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

        Drop storage drop = _dropFor(purchaseRecord.dropId);
        (uint256[] memory tokenIds, uint256[] memory amounts) = _revealedBundle(purchaseRecord, drop);

        try itemToken.safeBatchTransferFrom(address(this), purchaseRecord.buyer, tokenIds, amounts, "") {
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
        Drop storage drop = _dropFor(purchaseRecord.dropId);
        (uint256[] memory tokenIds, uint256[] memory amounts) = _revealedBundle(purchaseRecord, drop);
        purchaseRecord.tokenClaimed = true;
        itemToken.safeBatchTransferFrom(address(this), to, tokenIds, amounts, "");

        emit RevealedTokenClaimed(purchaseId, purchaseRecord.buyer, to, tokenId);
    }

    function _canReceiveERC1155(address account) private view returns (bool) {
        return account.code.length == 0
            || ERC165Checker.supportsInterface(account, type(IERC1155Receiver).interfaceId);
    }

    function _validateBonusBundle(CreateDropParams calldata params) private view {
        uint256 bonusCount = params.bonusTokenIds.length;
        if (
            bonusCount != params.bonusAmounts.length || bonusCount != params.bonusUris.length
                || bonusCount > MAX_BONUS_ITEMS
        ) {
            revert InvalidBonusBundle();
        }

        for (uint256 index = 0; index < bonusCount; index++) {
            uint256 tokenId = params.bonusTokenIds[index];
            string calldata tokenUri = params.bonusUris[index];
            if (
                tokenId == 0 || tokenId > itemToken.GAME_TOKEN_ID_MAX() || params.bonusAmounts[index] == 0
                    || bytes(tokenUri).length == 0
            ) {
                revert InvalidBonusToken(tokenId);
            }

            for (uint256 previous = 0; previous < index; previous++) {
                if (params.bonusTokenIds[previous] == tokenId) {
                    revert DuplicateBonusToken(tokenId);
                }
            }

            string storage configuredUri = _bonusTokenUris[tokenId];
            if (bytes(configuredUri).length != 0 && !_sameString(configuredUri, tokenUri)) {
                revert BonusUriMismatch(tokenId, configuredUri, tokenUri);
            }
            if (itemToken.hasCustomURI(tokenId)) {
                string memory existingUri = itemToken.uri(tokenId);
                if (!_sameString(existingUri, tokenUri)) {
                    revert BonusUriMismatch(tokenId, existingUri, tokenUri);
                }
            }
        }
    }

    function _mintBonusBundle(uint256 purchaseId, Drop storage drop) private {
        for (uint256 index = 0; index < drop.bonusTokenIds.length; index++) {
            uint256 tokenId = drop.bonusTokenIds[index];
            uint256 amount = drop.bonusAmounts[index];
            itemToken.mintGameItem(address(this), tokenId, amount, drop.bonusUris[index]);
            emit PackBonusMinted(purchaseId, tokenId, amount);
        }
    }

    function _awardDust(uint256 purchaseId, Purchase storage purchaseRecord, uint256 randomness) private {
        uint256 policyId = dropDustPolicyId[purchaseRecord.dropId];
        if (policyId == 0) return;

        DustRewardPolicy.Policy memory policy = dustRewardPolicy.getPolicy(policyId);
        uint256[4] memory amounts;
        amounts[uint256(DustLedger.DustKind.Magic)] = policy.magicAmount;
        for (uint256 index = 0; index < policy.specialtyRolls; index++) {
            uint256 roll = uint256(
                keccak256(abi.encode(randomness, address(this), purchaseId, "DUST_REWARD_V1", index))
            ) % dustRewardPolicy.WEIGHT_DENOMINATOR();
            if (roll < policy.echoWeight) {
                amounts[uint256(DustLedger.DustKind.Echo)] += policy.specialtyAmount;
            } else if (roll < uint256(policy.echoWeight) + uint256(policy.prismWeight)) {
                amounts[uint256(DustLedger.DustKind.Prism)] += policy.specialtyAmount;
            } else {
                amounts[uint256(DustLedger.DustKind.Star)] += policy.specialtyAmount;
            }
        }

        bytes32 contextId = keccak256(abi.encode("PACK_DUST_REWARD", address(this), purchaseId));
        dustLedger.credit(purchaseRecord.buyer, amounts, contextId);
        emit PackDustAwarded(purchaseId, purchaseRecord.buyer, policyId, amounts);
    }

    function _revealedBundle(Purchase storage purchaseRecord, Drop storage drop)
        private
        view
        returns (uint256[] memory tokenIds, uint256[] memory amounts)
    {
        uint256 bonusCount = drop.bonusTokenIds.length;
        tokenIds = new uint256[](bonusCount + 1);
        amounts = new uint256[](bonusCount + 1);
        tokenIds[0] = purchaseRecord.revealedTokenId;
        amounts[0] = 1;

        for (uint256 index = 0; index < bonusCount; index++) {
            tokenIds[index + 1] = drop.bonusTokenIds[index];
            amounts[index + 1] = drop.bonusAmounts[index];
        }
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

    function _sameString(string memory left, string memory right) private pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }

    function _allowlistLeaf(address account) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }
}
