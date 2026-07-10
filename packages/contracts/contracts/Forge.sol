// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";

contract Forge is AccessControl, Pausable, ReentrancyGuard {
    enum RecipeStatus {
        Draft,
        Simulated,
        AdminReviewed,
        Scheduled,
        Active,
        Paused,
        Retired
    }

    enum CraftReadiness {
        Ready,
        ForgePaused,
        RecipeInactive,
        ScheduleInactive,
        ManualReviewMissing,
        TotalCapReached,
        WalletCapReached,
        ApprovalMissing,
        MissingBurnInput,
        MissingCatalyst,
        OutputCapReached,
        EmptyImprint,
        ImprintUsed
    }

    bytes32 public constant RECIPE_ADMIN_ROLE = keccak256("RECIPE_ADMIN_ROLE");
    bytes32 public constant CRAFT_REVIEWER_ROLE = keccak256("CRAFT_REVIEWER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_BURN_INPUTS = 9;
    uint256 public constant MAX_CATALYSTS = 3;

    struct CreateRecipeParams {
        uint256[] inputTokenIds;
        uint256[] inputAmounts;
        uint256 outputTokenId;
        uint256 outputAmount;
        string outputUri;
        uint256 fee;
        uint256 startTime;
        uint256 endTime;
        uint256 maxTotalCrafts;
        uint256 maxCraftsPerWallet;
        bool requiresManualReview;
        bool excludeGrailProtectedInputs;
        uint256[] catalystTokenIds;
        uint256[] catalystAmounts;
        uint256 outputSupplyCap;
        bytes32 metadataHash;
    }

    struct Recipe {
        uint256[] inputTokenIds;
        uint256[] inputAmounts;
        uint256[] catalystTokenIds;
        uint256[] catalystAmounts;
        uint256 outputTokenId;
        uint256 outputAmount;
        string outputUri;
        uint256 fee;
        uint256 startTime;
        uint256 endTime;
        uint256 maxTotalCrafts;
        uint256 maxCraftsPerWallet;
        uint256 totalCrafts;
        RecipeStatus status;
        bool requiresManualReview;
        bool excludeGrailProtectedInputs;
        bool exists;
        uint256 outputSupplyCap;
        bytes32 metadataHash;
        bytes32 blueprintHash;
        bool reservationReleased;
    }

    struct RecipeView {
        uint256 outputTokenId;
        uint256 outputAmount;
        string outputUri;
        uint256 fee;
        uint256 startTime;
        uint256 endTime;
        uint256 maxTotalCrafts;
        uint256 maxCraftsPerWallet;
        uint256 totalCrafts;
        RecipeStatus status;
        bool requiresManualReview;
        bool excludeGrailProtectedInputs;
        bool exists;
        uint256 outputSupplyCap;
        bytes32 metadataHash;
        bytes32 blueprintHash;
        bool reservationReleased;
    }

    struct CraftRecord {
        uint256 recipeId;
        address crafter;
        uint256 outputTokenId;
        uint256 outputAmount;
        bytes32 imprintHash;
        uint256 craftedAt;
    }

    error InvalidAddress();
    error InvalidRecipeParams();
    error TooManyBurnInputs(uint256 count, uint256 maximum);
    error TooManyCatalysts(uint256 count, uint256 maximum);
    error DuplicateRecipeToken(uint256 tokenId);
    error InvalidBurnInputToken(uint256 tokenId);
    error InvalidCatalystToken(uint256 tokenId);
    error OutputTokenUsedAsInput(uint256 tokenId);
    error InvalidOutputTokenId(uint256 tokenId);
    error InvalidOutputTokenKind(uint256 tokenId, uint8 tokenKind);
    error OutputUriMismatch(uint256 tokenId, string expectedUri, string actualUri);
    error OutputSupplyCapMismatch(uint256 tokenId, uint256 expectedCap, uint256 actualCap);
    error OutputCapacityExceeded(uint256 tokenId, uint256 cap, uint256 committedOutput, uint256 requestedOutput);
    error RecipeNotFound(uint256 recipeId);
    error InvalidRecipeStatusTransition(uint256 recipeId, RecipeStatus currentStatus, RecipeStatus nextStatus);
    error RecipeNotActive(uint256 recipeId, RecipeStatus status);
    error InactiveSchedule(uint256 recipeId, uint256 startTime, uint256 endTime);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error ManualReviewRequired(uint256 recipeId);
    error ManualReviewNotEnabled(uint256 recipeId);
    error MaxTotalCraftsReached(uint256 recipeId, uint256 maxTotalCrafts);
    error MaxWalletCraftsReached(uint256 recipeId, address wallet, uint256 maxCraftsPerWallet);
    error MissingCatalyst(uint256 recipeId, uint256 tokenId, uint256 required, uint256 available);
    error EmptyImprint();
    error ImprintAlreadyUsed(uint256 recipeId, address crafter, bytes32 imprintHash);
    error TreasuryFeesUnavailable(address account);
    error TransferFailed(address to, uint256 amount);

    event RecipeCreated(uint256 indexed recipeId, address indexed creator);
    event BlueprintCommitted(
        uint256 indexed recipeId,
        bytes32 indexed blueprintHash,
        bytes32 indexed metadataHash,
        uint256 outputTokenId,
        uint256 outputSupplyCap,
        uint256 reservedOutput
    );
    event RecipeStatusUpdated(uint256 indexed recipeId, RecipeStatus previousStatus, RecipeStatus status);
    event OutputReservationReleased(uint256 indexed recipeId, uint256 indexed outputTokenId, uint256 amount);
    event CraftAllowanceUpdated(uint256 indexed recipeId, address indexed crafter, uint256 allowance);
    event Crafted(
        uint256 indexed recipeId,
        address indexed crafter,
        uint256 indexed outputTokenId,
        uint256 outputAmount,
        uint256 fee
    );
    event CraftProvenance(
        uint256 indexed craftId,
        uint256 indexed recipeId,
        address indexed crafter,
        bytes32 imprintHash,
        bytes32 blueprintHash
    );
    event TreasuryFeesWithdrawn(address indexed account, address indexed to, uint256 amount);

    ItemToken public immutable itemToken;
    InventoryRegistry public immutable inventoryRegistry;
    address payable public immutable treasury;

    uint256 public nextRecipeId = 1;
    uint256 public nextCraftId = 1;

    mapping(uint256 recipeId => Recipe recipe) private _recipes;
    mapping(uint256 outputTokenId => string outputUri) private _forgeOutputUris;
    mapping(uint256 recipeId => mapping(address wallet => uint256 crafts)) public walletCrafts;
    mapping(uint256 recipeId => mapping(address wallet => uint256 allowance)) public reviewAllowances;
    mapping(uint256 outputTokenId => uint256 supplyCap) public outputSupplyCaps;
    mapping(uint256 outputTokenId => uint256 reservedOutput) public outputReserved;
    mapping(uint256 recipeId => mapping(address crafter => mapping(bytes32 imprintHash => bool used)))
        public usedImprints;
    mapping(uint256 craftId => CraftRecord record) public crafts;
    mapping(address account => uint256 amount) public treasuryFeesCredit;

    constructor(ItemToken itemToken_, InventoryRegistry inventoryRegistry_, address treasury_) {
        if (address(itemToken_) == address(0) || address(inventoryRegistry_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }

        itemToken = itemToken_;
        inventoryRegistry = inventoryRegistry_;
        treasury = payable(treasury_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createRecipe(CreateRecipeParams calldata params)
        external
        onlyRole(RECIPE_ADMIN_ROLE)
        returns (uint256 recipeId)
    {
        (uint256 reservedOutput, bytes32 blueprintHash) = _validateCreateRecipeParams(params);

        recipeId = nextRecipeId++;
        Recipe storage recipe = _recipes[recipeId];
        recipe.outputTokenId = params.outputTokenId;
        recipe.outputAmount = params.outputAmount;
        recipe.outputUri = params.outputUri;
        recipe.fee = params.fee;
        recipe.startTime = params.startTime;
        recipe.endTime = params.endTime;
        recipe.maxTotalCrafts = params.maxTotalCrafts;
        recipe.maxCraftsPerWallet = params.maxCraftsPerWallet;
        recipe.status = RecipeStatus.Draft;
        recipe.requiresManualReview = params.requiresManualReview;
        recipe.excludeGrailProtectedInputs = params.excludeGrailProtectedInputs;
        recipe.exists = true;
        recipe.outputSupplyCap = params.outputSupplyCap;
        recipe.metadataHash = params.metadataHash;
        recipe.blueprintHash = blueprintHash;

        for (uint256 index = 0; index < params.inputTokenIds.length; index++) {
            recipe.inputTokenIds.push(params.inputTokenIds[index]);
            recipe.inputAmounts.push(params.inputAmounts[index]);
        }

        for (uint256 index = 0; index < params.catalystTokenIds.length; index++) {
            recipe.catalystTokenIds.push(params.catalystTokenIds[index]);
            recipe.catalystAmounts.push(params.catalystAmounts[index]);
        }

        if (outputSupplyCaps[params.outputTokenId] == 0) {
            outputSupplyCaps[params.outputTokenId] = params.outputSupplyCap;
        }
        outputReserved[params.outputTokenId] += reservedOutput;
        _lockOutputUri(params.outputTokenId, params.outputUri);

        emit RecipeCreated(recipeId, msg.sender);
        emit BlueprintCommitted(
            recipeId,
            blueprintHash,
            params.metadataHash,
            params.outputTokenId,
            params.outputSupplyCap,
            reservedOutput
        );
    }

    function setRecipeStatus(uint256 recipeId, RecipeStatus status) external onlyRole(RECIPE_ADMIN_ROLE) {
        Recipe storage recipe = _recipeFor(recipeId);
        RecipeStatus previousStatus = recipe.status;

        if (!_isValidStatusTransition(previousStatus, status)) {
            revert InvalidRecipeStatusTransition(recipeId, previousStatus, status);
        }

        recipe.status = status;
        if (status == RecipeStatus.Retired) {
            _releaseOutputReservation(recipeId, recipe);
        }

        emit RecipeStatusUpdated(recipeId, previousStatus, status);
    }

    function setCraftAllowance(uint256 recipeId, address crafter, uint256 allowance)
        external
        onlyRole(CRAFT_REVIEWER_ROLE)
    {
        if (crafter == address(0)) {
            revert InvalidAddress();
        }

        Recipe storage recipe = _recipeFor(recipeId);
        if (!recipe.requiresManualReview) {
            revert ManualReviewNotEnabled(recipeId);
        }

        reviewAllowances[recipeId][crafter] = allowance;
        emit CraftAllowanceUpdated(recipeId, crafter, allowance);
    }

    function craft(uint256 recipeId) external payable nonReentrant whenNotPaused returns (uint256 outputTokenId) {
        bytes32 imprintHash = keccak256(
            abi.encode(recipeId, msg.sender, walletCrafts[recipeId][msg.sender] + 1, nextCraftId, address(this))
        );
        return _craft(recipeId, imprintHash);
    }

    function craftWithImprint(uint256 recipeId, bytes32 imprintHash)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 outputTokenId)
    {
        return _craft(recipeId, imprintHash);
    }

    function craftReadiness(uint256 recipeId, address crafter, bytes32 imprintHash)
        external
        view
        returns (CraftReadiness reason, uint256 tokenId, uint256 required, uint256 available)
    {
        Recipe storage recipe = _recipeFor(recipeId);

        if (paused()) {
            return (CraftReadiness.ForgePaused, 0, 0, 0);
        }
        if (recipe.status != RecipeStatus.Active) {
            return (CraftReadiness.RecipeInactive, 0, 0, 0);
        }
        if (block.timestamp < recipe.startTime || block.timestamp > recipe.endTime) {
            return (CraftReadiness.ScheduleInactive, 0, 0, 0);
        }
        if (recipe.requiresManualReview && reviewAllowances[recipeId][crafter] == 0) {
            return (CraftReadiness.ManualReviewMissing, 0, 0, 0);
        }
        if (recipe.totalCrafts >= recipe.maxTotalCrafts) {
            return (CraftReadiness.TotalCapReached, 0, 0, 0);
        }
        if (walletCrafts[recipeId][crafter] >= recipe.maxCraftsPerWallet) {
            return (CraftReadiness.WalletCapReached, 0, 0, 0);
        }
        if (!itemToken.isApprovedForAll(crafter, address(this))) {
            return (CraftReadiness.ApprovalMissing, 0, 0, 0);
        }

        for (uint256 index = 0; index < recipe.inputTokenIds.length; index++) {
            uint256 inputTokenId = recipe.inputTokenIds[index];
            uint256 inputRequired = recipe.inputAmounts[index];
            uint256 inputAvailable = itemToken.balanceOf(crafter, inputTokenId);
            if (inputAvailable < inputRequired) {
                return (CraftReadiness.MissingBurnInput, inputTokenId, inputRequired, inputAvailable);
            }
        }

        for (uint256 index = 0; index < recipe.catalystTokenIds.length; index++) {
            uint256 catalystTokenId = recipe.catalystTokenIds[index];
            uint256 catalystRequired = recipe.catalystAmounts[index];
            uint256 catalystAvailable = itemToken.balanceOf(crafter, catalystTokenId);
            if (catalystAvailable < catalystRequired) {
                return (CraftReadiness.MissingCatalyst, catalystTokenId, catalystRequired, catalystAvailable);
            }
        }

        uint256 currentSupply = itemToken.totalSupply(recipe.outputTokenId);
        if (currentSupply > recipe.outputSupplyCap || recipe.outputAmount > recipe.outputSupplyCap - currentSupply) {
            return (CraftReadiness.OutputCapReached, recipe.outputTokenId, recipe.outputAmount, currentSupply);
        }
        if (imprintHash == bytes32(0)) {
            return (CraftReadiness.EmptyImprint, 0, 0, 0);
        }
        if (usedImprints[recipeId][crafter][imprintHash]) {
            return (CraftReadiness.ImprintUsed, 0, 0, 0);
        }

        return (CraftReadiness.Ready, 0, 0, 0);
    }

    function getRecipeInputs(uint256 recipeId) external view returns (uint256[] memory, uint256[] memory) {
        Recipe storage recipe = _recipeFor(recipeId);
        return (recipe.inputTokenIds, recipe.inputAmounts);
    }

    function getRecipeCatalysts(uint256 recipeId) external view returns (uint256[] memory, uint256[] memory) {
        Recipe storage recipe = _recipeFor(recipeId);
        return (recipe.catalystTokenIds, recipe.catalystAmounts);
    }

    function recipes(uint256 recipeId) external view returns (RecipeView memory recipeView) {
        Recipe storage recipe = _recipeFor(recipeId);

        recipeView.outputTokenId = recipe.outputTokenId;
        recipeView.outputAmount = recipe.outputAmount;
        recipeView.outputUri = recipe.outputUri;
        recipeView.fee = recipe.fee;
        recipeView.startTime = recipe.startTime;
        recipeView.endTime = recipe.endTime;
        recipeView.maxTotalCrafts = recipe.maxTotalCrafts;
        recipeView.maxCraftsPerWallet = recipe.maxCraftsPerWallet;
        recipeView.totalCrafts = recipe.totalCrafts;
        recipeView.status = recipe.status;
        recipeView.requiresManualReview = recipe.requiresManualReview;
        recipeView.excludeGrailProtectedInputs = recipe.excludeGrailProtectedInputs;
        recipeView.exists = recipe.exists;
        recipeView.outputSupplyCap = recipe.outputSupplyCap;
        recipeView.metadataHash = recipe.metadataHash;
        recipeView.blueprintHash = recipe.blueprintHash;
        recipeView.reservationReleased = recipe.reservationReleased;
    }

    function withdrawTreasuryFees() external nonReentrant {
        _withdrawTreasuryFeesTo(payable(msg.sender));
    }

    function withdrawTreasuryFeesTo(address payable to) external nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }
        _withdrawTreasuryFeesTo(to);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _craft(uint256 recipeId, bytes32 imprintHash) private returns (uint256 outputTokenId) {
        Recipe storage recipe = _recipeFor(recipeId);

        _validateCraft(recipeId, recipe, imprintHash);
        uint256 craftId = _recordCraft(recipeId, recipe, imprintHash);
        _burnInputs(recipe);
        outputTokenId = _mintOutput(recipe);

        crafts[craftId] = CraftRecord({
            recipeId: recipeId,
            crafter: msg.sender,
            outputTokenId: outputTokenId,
            outputAmount: recipe.outputAmount,
            imprintHash: imprintHash,
            craftedAt: block.timestamp
        });

        emit Crafted(recipeId, msg.sender, outputTokenId, recipe.outputAmount, msg.value);
        emit CraftProvenance(craftId, recipeId, msg.sender, imprintHash, recipe.blueprintHash);
    }

    function _validateCreateRecipeParams(CreateRecipeParams calldata params)
        private
        view
        returns (uint256 reservedOutput, bytes32 blueprintHash)
    {
        uint256 inputCount = params.inputTokenIds.length;
        uint256 catalystCount = params.catalystTokenIds.length;
        if (
            inputCount == 0 || inputCount != params.inputAmounts.length
                || catalystCount != params.catalystAmounts.length || params.outputAmount == 0
                || bytes(params.outputUri).length == 0 || params.startTime >= params.endTime
                || params.maxTotalCrafts == 0 || params.maxCraftsPerWallet == 0
                || params.maxCraftsPerWallet > params.maxTotalCrafts || params.outputSupplyCap == 0
                || params.metadataHash == bytes32(0)
        ) {
            revert InvalidRecipeParams();
        }
        if (inputCount > MAX_BURN_INPUTS) {
            revert TooManyBurnInputs(inputCount, MAX_BURN_INPUTS);
        }
        if (catalystCount > MAX_CATALYSTS) {
            revert TooManyCatalysts(catalystCount, MAX_CATALYSTS);
        }
        if (params.outputTokenId == 0 || params.outputTokenId > itemToken.GAME_TOKEN_ID_MAX()) {
            revert InvalidOutputTokenId(params.outputTokenId);
        }

        ItemToken.TokenKind outputKind = itemToken.tokenKind(params.outputTokenId);
        if (outputKind == ItemToken.TokenKind.Inventory) {
            revert InvalidOutputTokenKind(params.outputTokenId, uint8(outputKind));
        }

        _validateBurnInputs(params);
        _validateCatalysts(params);
        _validateOutputUri(params.outputTokenId, params.outputUri);

        uint256 configuredCap = outputSupplyCaps[params.outputTokenId];
        if (configuredCap != 0 && configuredCap != params.outputSupplyCap) {
            revert OutputSupplyCapMismatch(params.outputTokenId, configuredCap, params.outputSupplyCap);
        }

        reservedOutput = params.outputAmount * params.maxTotalCrafts;
        uint256 currentSupply = itemToken.totalSupply(params.outputTokenId);
        uint256 currentReserved = outputReserved[params.outputTokenId];
        if (
            currentSupply > params.outputSupplyCap || currentReserved > params.outputSupplyCap - currentSupply
                || reservedOutput > params.outputSupplyCap - currentSupply - currentReserved
        ) {
            revert OutputCapacityExceeded(
                params.outputTokenId,
                params.outputSupplyCap,
                currentSupply + currentReserved,
                reservedOutput
            );
        }

        blueprintHash = keccak256(abi.encode(params));
    }

    function _validateBurnInputs(CreateRecipeParams calldata params) private view {
        uint256 inputCount = params.inputTokenIds.length;
        for (uint256 index = 0; index < inputCount; index++) {
            uint256 tokenId = params.inputTokenIds[index];
            if (params.inputAmounts[index] == 0) {
                revert InvalidRecipeParams();
            }
            if (tokenId == params.outputTokenId) {
                revert OutputTokenUsedAsInput(tokenId);
            }
            if (tokenId == 0 || tokenId > itemToken.GAME_TOKEN_ID_MAX()) {
                revert InvalidBurnInputToken(tokenId);
            }

            for (uint256 previous = 0; previous < index; previous++) {
                if (params.inputTokenIds[previous] == tokenId) {
                    revert DuplicateRecipeToken(tokenId);
                }
            }
        }
    }

    function _validateCatalysts(CreateRecipeParams calldata params) private view {
        uint256 catalystCount = params.catalystTokenIds.length;
        for (uint256 index = 0; index < catalystCount; index++) {
            uint256 tokenId = params.catalystTokenIds[index];
            if (tokenId == 0 || params.catalystAmounts[index] == 0) {
                revert InvalidRecipeParams();
            }
            if (tokenId == params.outputTokenId) {
                revert OutputTokenUsedAsInput(tokenId);
            }

            for (uint256 inputIndex = 0; inputIndex < params.inputTokenIds.length; inputIndex++) {
                if (params.inputTokenIds[inputIndex] == tokenId) {
                    revert DuplicateRecipeToken(tokenId);
                }
            }
            for (uint256 previous = 0; previous < index; previous++) {
                if (params.catalystTokenIds[previous] == tokenId) {
                    revert DuplicateRecipeToken(tokenId);
                }
            }

            if (tokenId > itemToken.GAME_TOKEN_ID_MAX()) {
                try inventoryRegistry.getInventoryByTokenId(tokenId) returns (
                    InventoryRegistry.InventoryRecord memory record
                ) {
                    if (record.tokenId != tokenId) {
                        revert InvalidCatalystToken(tokenId);
                    }
                } catch {
                    revert InvalidCatalystToken(tokenId);
                }
            }
        }
    }

    function _validateOutputUri(uint256 outputTokenId, string calldata outputUri) private view {
        string storage configuredOutputUri = _forgeOutputUris[outputTokenId];
        if (bytes(configuredOutputUri).length != 0 && !_sameString(configuredOutputUri, outputUri)) {
            revert OutputUriMismatch(outputTokenId, configuredOutputUri, outputUri);
        }
        if (itemToken.hasCustomURI(outputTokenId)) {
            string memory existingOutputUri = itemToken.uri(outputTokenId);
            if (!_sameString(existingOutputUri, outputUri)) {
                revert OutputUriMismatch(outputTokenId, existingOutputUri, outputUri);
            }
        }
    }

    function _lockOutputUri(uint256 outputTokenId, string calldata outputUri) private {
        if (bytes(_forgeOutputUris[outputTokenId]).length == 0) {
            _forgeOutputUris[outputTokenId] = outputUri;
        }
    }

    function _validateCraft(uint256 recipeId, Recipe storage recipe, bytes32 imprintHash) private view {
        if (recipe.status != RecipeStatus.Active) {
            revert RecipeNotActive(recipeId, recipe.status);
        }
        if (block.timestamp < recipe.startTime || block.timestamp > recipe.endTime) {
            revert InactiveSchedule(recipeId, recipe.startTime, recipe.endTime);
        }
        if (msg.value != recipe.fee) {
            revert ExactPaymentRequired(recipe.fee, msg.value);
        }
        if (recipe.requiresManualReview && reviewAllowances[recipeId][msg.sender] == 0) {
            revert ManualReviewRequired(recipeId);
        }
        if (recipe.totalCrafts >= recipe.maxTotalCrafts) {
            revert MaxTotalCraftsReached(recipeId, recipe.maxTotalCrafts);
        }

        uint256 walletCraftCount = walletCrafts[recipeId][msg.sender];
        if (walletCraftCount >= recipe.maxCraftsPerWallet) {
            revert MaxWalletCraftsReached(recipeId, msg.sender, recipe.maxCraftsPerWallet);
        }
        if (imprintHash == bytes32(0)) {
            revert EmptyImprint();
        }
        if (usedImprints[recipeId][msg.sender][imprintHash]) {
            revert ImprintAlreadyUsed(recipeId, msg.sender, imprintHash);
        }

        uint256 currentSupply = itemToken.totalSupply(recipe.outputTokenId);
        if (currentSupply > recipe.outputSupplyCap || recipe.outputAmount > recipe.outputSupplyCap - currentSupply) {
            revert OutputCapacityExceeded(
                recipe.outputTokenId,
                recipe.outputSupplyCap,
                currentSupply,
                recipe.outputAmount
            );
        }

        for (uint256 index = 0; index < recipe.catalystTokenIds.length; index++) {
            uint256 tokenId = recipe.catalystTokenIds[index];
            uint256 required = recipe.catalystAmounts[index];
            uint256 available = itemToken.balanceOf(msg.sender, tokenId);
            if (available < required) {
                revert MissingCatalyst(recipeId, tokenId, required, available);
            }
        }
    }

    function _recordCraft(uint256 recipeId, Recipe storage recipe, bytes32 imprintHash)
        private
        returns (uint256 craftId)
    {
        recipe.totalCrafts += 1;
        walletCrafts[recipeId][msg.sender] += 1;
        usedImprints[recipeId][msg.sender][imprintHash] = true;
        outputReserved[recipe.outputTokenId] -= recipe.outputAmount;
        treasuryFeesCredit[treasury] += msg.value;
        if (recipe.requiresManualReview) {
            reviewAllowances[recipeId][msg.sender] -= 1;
        }
        craftId = nextCraftId++;
    }

    function _burnInputs(Recipe storage recipe) private {
        for (uint256 index = 0; index < recipe.inputTokenIds.length; index++) {
            itemToken.burn(msg.sender, recipe.inputTokenIds[index], recipe.inputAmounts[index]);
        }
    }

    function _mintOutput(Recipe storage recipe) private returns (uint256 outputTokenId) {
        outputTokenId = recipe.outputTokenId;
        itemToken.mintGameItem(msg.sender, outputTokenId, recipe.outputAmount, recipe.outputUri);
    }

    function _releaseOutputReservation(uint256 recipeId, Recipe storage recipe) private {
        if (recipe.reservationReleased) {
            return;
        }

        uint256 remainingCrafts = recipe.maxTotalCrafts - recipe.totalCrafts;
        uint256 releasedOutput = remainingCrafts * recipe.outputAmount;
        recipe.reservationReleased = true;
        outputReserved[recipe.outputTokenId] -= releasedOutput;
        emit OutputReservationReleased(recipeId, recipe.outputTokenId, releasedOutput);
    }

    function _recipeFor(uint256 recipeId) private view returns (Recipe storage) {
        Recipe storage recipe = _recipes[recipeId];
        if (!recipe.exists) {
            revert RecipeNotFound(recipeId);
        }
        return recipe;
    }

    function _isValidStatusTransition(RecipeStatus from, RecipeStatus to) private pure returns (bool) {
        if (from == to || from == RecipeStatus.Retired) {
            return false;
        }
        if (to == RecipeStatus.Retired) {
            return true;
        }
        if (from == RecipeStatus.Draft && to == RecipeStatus.Simulated) {
            return true;
        }
        if (from == RecipeStatus.Simulated && to == RecipeStatus.AdminReviewed) {
            return true;
        }
        if (from == RecipeStatus.AdminReviewed && to == RecipeStatus.Scheduled) {
            return true;
        }
        if (from == RecipeStatus.Scheduled && to == RecipeStatus.Active) {
            return true;
        }
        if (from == RecipeStatus.Active && to == RecipeStatus.Paused) {
            return true;
        }
        return from == RecipeStatus.Paused && to == RecipeStatus.Active;
    }

    function _withdrawTreasuryFeesTo(address payable to) private {
        uint256 amount = treasuryFeesCredit[msg.sender];
        if (amount == 0) {
            revert TreasuryFeesUnavailable(msg.sender);
        }

        treasuryFeesCredit[msg.sender] = 0;
        _sendNative(to, amount);
        emit TreasuryFeesWithdrawn(msg.sender, to, amount);
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
}
