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

    bytes32 public constant RECIPE_ADMIN_ROLE = keccak256("RECIPE_ADMIN_ROLE");

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
    }

    struct Recipe {
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
        uint256 totalCrafts;
        RecipeStatus status;
        bool requiresManualReview;
        bool excludeGrailProtectedInputs;
        bool exists;
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
    }

    error InvalidAddress();
    error InvalidRecipeParams();
    error RecipeNotFound(uint256 recipeId);
    error InvalidRecipeStatusTransition(uint256 recipeId, RecipeStatus currentStatus, RecipeStatus nextStatus);
    error RecipeNotActive(uint256 recipeId, RecipeStatus status);
    error InactiveSchedule(uint256 recipeId, uint256 startTime, uint256 endTime);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error ManualReviewRequired(uint256 recipeId);
    error MaxTotalCraftsReached(uint256 recipeId, uint256 maxTotalCrafts);
    error MaxWalletCraftsReached(uint256 recipeId, address wallet, uint256 maxCraftsPerWallet);
    error GrailProtectedInputExcluded(uint256 recipeId, uint256 tokenId);
    error TreasuryFeesUnavailable(address account);
    error TransferFailed(address to, uint256 amount);

    event RecipeCreated(uint256 indexed recipeId, address indexed creator);
    event RecipeStatusUpdated(uint256 indexed recipeId, RecipeStatus previousStatus, RecipeStatus status);
    event Crafted(
        uint256 indexed recipeId,
        address indexed crafter,
        uint256 indexed outputTokenId,
        uint256 outputAmount,
        uint256 fee
    );
    event TreasuryFeesWithdrawn(address indexed account, address indexed to, uint256 amount);

    ItemToken public immutable itemToken;
    InventoryRegistry public immutable inventoryRegistry;
    address payable public immutable treasury;

    uint256 public nextRecipeId = 1;

    mapping(uint256 recipeId => Recipe recipe) private _recipes;
    mapping(uint256 recipeId => mapping(address wallet => uint256 crafts)) public walletCrafts;
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
        _validateCreateRecipeParams(params);

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

        for (uint256 index = 0; index < params.inputTokenIds.length; index++) {
            recipe.inputTokenIds.push(params.inputTokenIds[index]);
            recipe.inputAmounts.push(params.inputAmounts[index]);
        }

        emit RecipeCreated(recipeId, msg.sender);
    }

    function setRecipeStatus(uint256 recipeId, RecipeStatus status) external onlyRole(RECIPE_ADMIN_ROLE) {
        Recipe storage recipe = _recipeFor(recipeId);
        RecipeStatus previousStatus = recipe.status;

        if (!_isValidStatusTransition(previousStatus, status)) {
            revert InvalidRecipeStatusTransition(recipeId, previousStatus, status);
        }

        recipe.status = status;

        emit RecipeStatusUpdated(recipeId, previousStatus, status);
    }

    function craft(uint256 recipeId) external payable nonReentrant whenNotPaused returns (uint256 outputTokenId) {
        Recipe storage recipe = _recipeFor(recipeId);

        _validateCraft(recipeId, recipe);
        _recordCraft(recipeId, recipe);
        _burnInputs(recipe);

        outputTokenId = _mintOutput(recipe);

        emit Crafted(recipeId, msg.sender, outputTokenId, recipe.outputAmount, msg.value);
    }

    function getRecipeInputs(uint256 recipeId) external view returns (uint256[] memory, uint256[] memory) {
        Recipe storage recipe = _recipeFor(recipeId);

        return (recipe.inputTokenIds, recipe.inputAmounts);
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

    function pause() external onlyRole(RECIPE_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(RECIPE_ADMIN_ROLE) {
        _unpause();
    }

    function _validateCreateRecipeParams(CreateRecipeParams calldata params) private pure {
        uint256 inputCount = params.inputTokenIds.length;
        if (
            inputCount == 0 || inputCount != params.inputAmounts.length || params.outputAmount == 0
                || params.startTime >= params.endTime || params.maxTotalCrafts == 0
                || params.maxCraftsPerWallet == 0 || params.maxCraftsPerWallet > params.maxTotalCrafts
        ) {
            revert InvalidRecipeParams();
        }

        for (uint256 index = 0; index < inputCount; index++) {
            if (params.inputAmounts[index] == 0) {
                revert InvalidRecipeParams();
            }
        }
    }

    function _validateCraft(uint256 recipeId, Recipe storage recipe) private view {
        if (recipe.status != RecipeStatus.Active) {
            revert RecipeNotActive(recipeId, recipe.status);
        }

        if (block.timestamp < recipe.startTime || block.timestamp > recipe.endTime) {
            revert InactiveSchedule(recipeId, recipe.startTime, recipe.endTime);
        }

        if (msg.value != recipe.fee) {
            revert ExactPaymentRequired(recipe.fee, msg.value);
        }

        if (recipe.requiresManualReview) {
            revert ManualReviewRequired(recipeId);
        }

        if (recipe.totalCrafts >= recipe.maxTotalCrafts) {
            revert MaxTotalCraftsReached(recipeId, recipe.maxTotalCrafts);
        }

        uint256 walletCraftCount = walletCrafts[recipeId][msg.sender];
        if (walletCraftCount >= recipe.maxCraftsPerWallet) {
            revert MaxWalletCraftsReached(recipeId, msg.sender, recipe.maxCraftsPerWallet);
        }

        if (recipe.excludeGrailProtectedInputs) {
            uint256 inputCount = recipe.inputTokenIds.length;
            for (uint256 index = 0; index < inputCount; index++) {
                uint256 tokenId = recipe.inputTokenIds[index];
                if (inventoryRegistry.isGrailProtectedToken(tokenId)) {
                    revert GrailProtectedInputExcluded(recipeId, tokenId);
                }
            }
        }
    }

    function _recordCraft(uint256 recipeId, Recipe storage recipe) private {
        recipe.totalCrafts += 1;
        walletCrafts[recipeId][msg.sender] += 1;
        treasuryFeesCredit[treasury] += msg.value;
    }

    function _burnInputs(Recipe storage recipe) private {
        uint256 inputCount = recipe.inputTokenIds.length;
        for (uint256 index = 0; index < inputCount; index++) {
            itemToken.burn(msg.sender, recipe.inputTokenIds[index], recipe.inputAmounts[index]);
        }
    }

    function _mintOutput(Recipe storage recipe) private returns (uint256 outputTokenId) {
        outputTokenId = recipe.outputTokenId;
        itemToken.mintGameItem(msg.sender, outputTokenId, recipe.outputAmount, recipe.outputUri);
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
}
