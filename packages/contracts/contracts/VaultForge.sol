// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CollectibleForgePolicy} from "./CollectibleForgePolicy.sol";
import {DustLedger} from "./DustLedger.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";
import {TierPool} from "./TierPool.sol";
import {TradeInVault} from "./TradeInVault.sol";
import {VaultPassport} from "./VaultPassport.sol";
import {IRandomnessProvider} from "./randomness/IRandomnessProvider.sol";

contract VaultForge is AccessControl, Pausable, ReentrancyGuard {
    enum RecipeKind {
        Recast,
        GuidedRecast,
        Ascension,
        GuidedAscension,
        SetAscension
    }

    enum ClaimStatus {
        None,
        PendingRandomness,
        AwaitingChoice,
        Settled,
        Cancelled
    }

    struct RecipeConfig {
        uint256[4] dustAmounts;
        uint256 fee;
        uint256 maxTotalClaims;
        uint256 maxClaimsPerWallet;
        uint32 version;
        uint8 tradeInCount;
        uint8 optionCount;
        bool active;
    }

    struct Claim {
        address account;
        uint256 anchorTokenId;
        uint256 outputTokenId;
        uint256 fee;
        uint256 createdAt;
        uint256 choiceDeadline;
        bytes32 requestId;
        bytes32 poolKey;
        bytes32 imprintHash;
        uint256[4] dustAmounts;
        RecipeKind recipeKind;
        ClaimStatus status;
        uint8 inputTier;
        uint8 outputTier;
        uint8 optionCount;
        uint8 defaultIndex;
    }

    struct CraftContext {
        bytes32 poolKey;
        bytes32 requestId;
        uint8 inputTier;
        uint8 outputTier;
    }

    bytes32 public constant RECIPE_ADMIN_ROLE = keccak256("RECIPE_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant RANDOMNESS_TIMEOUT = 1 days;
    uint256 public constant CHOICE_WINDOW = 7 days;
    uint256 public constant MAX_DUST_PER_KIND = 1_000_000;
    uint256 public constant MAX_RECIPE_FEE = 1 ether;

    error InvalidAddress();
    error InvalidRecipeConfig(RecipeKind recipeKind);
    error RecipeInactive(RecipeKind recipeKind);
    error ExactPaymentRequired(uint256 expected, uint256 actual);
    error RecipeTotalCapReached(RecipeKind recipeKind, uint256 cap);
    error RecipeWalletCapReached(RecipeKind recipeKind, address account, uint256 cap);
    error InvalidTradeInCount(uint256 required, uint256 actual);
    error InvalidDuplicateProofCount(uint256 required, uint256 actual);
    error DuplicateTradeInToken(uint256 tokenId);
    error InvalidTradeInToken(uint256 tokenId);
    error InvalidDuplicateProof(uint256 tradeInTokenId, uint256 proofTokenId);
    error GrailTradeInBlocked(uint256 tokenId);
    error TradeInTierMismatch(uint256 tokenId, uint8 expected, uint8 actual);
    error SetMismatch(uint256 tokenId, bytes32 expected, bytes32 actual);
    error MissingAnchor(uint256 tokenId);
    error AnchorTierMismatch(uint256 tokenId, uint8 expected, uint8 actual);
    error PassportTierMismatch(address account, uint8 passportRank, uint8 tradeInTier);
    error ActiveAscensionExists(address account, uint256 claimId);
    error EmptyImprint();
    error ClaimNotFound(uint256 claimId);
    error InvalidClaimStatus(uint256 claimId, ClaimStatus expected, ClaimStatus actual);
    error RandomnessNotReady(uint256 claimId);
    error RandomnessAlreadyReady(uint256 claimId);
    error RandomnessTimeoutNotReached(uint256 claimId, uint256 availableAt);
    error UnauthorizedClaimOwner(uint256 claimId, address caller);
    error ChoiceWindowOpen(uint256 claimId, uint256 closesAt);
    error ChoiceWindowExpired(uint256 claimId, uint256 closedAt);
    error InvalidDustExchange();
    error DustExchangeUnavailable();
    error TreasuryCreditUnavailable(address account);
    error RefundUnavailable(address account);
    error TransferFailed(address to, uint256 amount);

    event RecipeConfigured(
        RecipeKind indexed recipeKind,
        uint32 indexed version,
        uint256[4] dustAmounts,
        uint256 fee,
        uint256 maxTotalClaims,
        uint256 maxClaimsPerWallet,
        bool active
    );
    event ClaimCreated(
        uint256 indexed claimId,
        address indexed account,
        RecipeKind indexed recipeKind,
        uint8 inputTier,
        uint8 outputTier,
        uint256 anchorTokenId,
        bytes32 requestId
    );
    event ClaimChoicesReady(uint256 indexed claimId, uint256[] tokenIds, uint256 choiceDeadline, uint8 defaultIndex);
    event ClaimSettled(
        uint256 indexed claimId,
        address indexed account,
        uint256 indexed outputTokenId,
        RecipeKind recipeKind
    );
    event ClaimCancelled(uint256 indexed claimId, address indexed account);
    event DustExchangeConfigured(uint256 magicCost, uint256 inputAmount, uint256 outputAmount);
    event DustExchanged(
        address indexed account,
        DustLedger.DustKind indexed fromKind,
        DustLedger.DustKind indexed toKind,
        uint256 inputAmount,
        uint256 outputAmount
    );
    event TreasuryFeesWithdrawn(address indexed treasury, address indexed to, uint256 amount);
    event RefundWithdrawn(address indexed account, address indexed to, uint256 amount);

    ItemToken public immutable itemToken;
    InventoryRegistry public immutable inventoryRegistry;
    CollectibleForgePolicy public immutable collectiblePolicy;
    DustLedger public immutable dustLedger;
    TradeInVault public immutable tradeInVault;
    TierPool public immutable tierPool;
    VaultPassport public immutable passport;
    IRandomnessProvider public immutable randomnessProvider;
    address payable public immutable treasury;

    uint256 public nextClaimId = 1;
    uint256 public exchangeMagicCost;
    uint256 public exchangeInputAmount;
    uint256 public exchangeOutputAmount;

    mapping(RecipeKind recipeKind => RecipeConfig config) public recipeConfigs;
    mapping(RecipeKind recipeKind => uint256 count) public totalClaimsByRecipe;
    mapping(RecipeKind recipeKind => mapping(address account => uint256 count)) public walletClaimsByRecipe;
    mapping(uint256 claimId => Claim claim) private _claims;
    mapping(uint256 claimId => uint256[] tokenIds) private _claimTradeIns;
    mapping(address account => uint256 claimId) public activeAscensionClaim;
    mapping(address account => uint256 nonce) public dustExchangeNonces;
    mapping(address account => uint256 amount) public treasuryFeesCredit;
    mapping(address account => uint256 amount) public refundCredit;

    constructor(
        ItemToken itemToken_,
        InventoryRegistry inventoryRegistry_,
        CollectibleForgePolicy collectiblePolicy_,
        DustLedger dustLedger_,
        TradeInVault tradeInVault_,
        TierPool tierPool_,
        VaultPassport passport_,
        IRandomnessProvider randomnessProvider_,
        address payable treasury_
    ) {
        if (
            address(itemToken_) == address(0) || address(inventoryRegistry_) == address(0)
                || address(collectiblePolicy_) == address(0) || address(dustLedger_) == address(0)
                || address(tradeInVault_) == address(0) || address(tierPool_) == address(0)
                || address(passport_) == address(0) || address(randomnessProvider_) == address(0)
                || treasury_ == address(0)
        ) {
            revert InvalidAddress();
        }
        itemToken = itemToken_;
        inventoryRegistry = inventoryRegistry_;
        collectiblePolicy = collectiblePolicy_;
        dustLedger = dustLedger_;
        tradeInVault = tradeInVault_;
        tierPool = tierPool_;
        passport = passport_;
        randomnessProvider = randomnessProvider_;
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function configureRecipe(
        RecipeKind recipeKind,
        uint256[4] calldata dustAmounts,
        uint256 fee,
        uint256 maxTotalClaims,
        uint256 maxClaimsPerWallet,
        bool active
    ) external onlyRole(RECIPE_ADMIN_ROLE) {
        (uint8 tradeInCount, uint8 optionCount) = _recipeShape(recipeKind);
        if (
            dustAmounts[0] == 0 || fee > MAX_RECIPE_FEE || maxTotalClaims == 0 || maxClaimsPerWallet == 0
                || maxClaimsPerWallet > maxTotalClaims
        ) {
            revert InvalidRecipeConfig(recipeKind);
        }
        for (uint256 index = 0; index < 4; index++) {
            if (dustAmounts[index] > MAX_DUST_PER_KIND) revert InvalidRecipeConfig(recipeKind);
        }
        _validateDustShape(recipeKind, dustAmounts);

        RecipeConfig storage config = recipeConfigs[recipeKind];
        uint32 version = config.version + 1;
        config.dustAmounts = dustAmounts;
        config.fee = fee;
        config.maxTotalClaims = maxTotalClaims;
        config.maxClaimsPerWallet = maxClaimsPerWallet;
        config.version = version;
        config.tradeInCount = tradeInCount;
        config.optionCount = optionCount;
        config.active = active;

        emit RecipeConfigured(
            recipeKind,
            version,
            dustAmounts,
            fee,
            maxTotalClaims,
            maxClaimsPerWallet,
            active
        );
    }

    function configureDustExchange(uint256 magicCost, uint256 inputAmount, uint256 outputAmount)
        external
        onlyRole(RECIPE_ADMIN_ROLE)
    {
        if (
            magicCost == 0 || inputAmount == 0 || outputAmount == 0 || inputAmount <= outputAmount
                || magicCost > MAX_DUST_PER_KIND || inputAmount > MAX_DUST_PER_KIND
                || outputAmount > MAX_DUST_PER_KIND
        ) {
            revert InvalidDustExchange();
        }
        exchangeMagicCost = magicCost;
        exchangeInputAmount = inputAmount;
        exchangeOutputAmount = outputAmount;
        emit DustExchangeConfigured(magicCost, inputAmount, outputAmount);
    }

    function craft(
        RecipeKind recipeKind,
        uint256 anchorTokenId,
        uint256[] calldata tradeInTokenIds,
        uint256[] calldata duplicateProofTokenIds,
        bytes32 imprintHash
    ) external payable nonReentrant whenNotPaused returns (uint256 claimId) {
        RecipeConfig memory config = recipeConfigs[recipeKind];
        if (!config.active) revert RecipeInactive(recipeKind);
        if (msg.value != config.fee) revert ExactPaymentRequired(config.fee, msg.value);
        if (totalClaimsByRecipe[recipeKind] >= config.maxTotalClaims) {
            revert RecipeTotalCapReached(recipeKind, config.maxTotalClaims);
        }
        if (walletClaimsByRecipe[recipeKind][msg.sender] >= config.maxClaimsPerWallet) {
            revert RecipeWalletCapReached(recipeKind, msg.sender, config.maxClaimsPerWallet);
        }
        if (tradeInTokenIds.length != config.tradeInCount) {
            revert InvalidTradeInCount(config.tradeInCount, tradeInTokenIds.length);
        }
        if (duplicateProofTokenIds.length != config.tradeInCount) {
            revert InvalidDuplicateProofCount(config.tradeInCount, duplicateProofTokenIds.length);
        }
        if (imprintHash == bytes32(0)) revert EmptyImprint();

        claimId = nextClaimId++;
        CraftContext memory context = _prepareCraftContext(
            claimId,
            recipeKind,
            anchorTokenId,
            tradeInTokenIds,
            duplicateProofTokenIds,
            config.optionCount
        );
        _createClaim(
            claimId,
            recipeKind,
            anchorTokenId,
            tradeInTokenIds,
            imprintHash,
            config,
            context
        );
    }

    function reveal(uint256 claimId) external nonReentrant whenNotPaused {
        Claim storage claim = _claimFor(claimId);
        _requireStatus(claimId, claim, ClaimStatus.PendingRandomness);
        (bool ready, uint256 randomness) = randomnessProvider.readRandomness(claim.requestId);
        if (!ready) revert RandomnessNotReady(claimId);

        uint256[] memory candidates = tierPool.prepareClaim(claimId, randomness);
        if (claim.optionCount == 1) {
            _settleClaim(claimId, claim, 0, claim.account);
            return;
        }

        claim.status = ClaimStatus.AwaitingChoice;
        claim.choiceDeadline = block.timestamp + CHOICE_WINDOW;
        claim.defaultIndex = uint8(randomness % claim.optionCount);
        emit ClaimChoicesReady(claimId, candidates, claim.choiceDeadline, claim.defaultIndex);
    }

    function selectCandidate(uint256 claimId, uint256 selectedIndex, address to) external nonReentrant whenNotPaused {
        Claim storage claim = _claimFor(claimId);
        _requireStatus(claimId, claim, ClaimStatus.AwaitingChoice);
        if (msg.sender != claim.account) revert UnauthorizedClaimOwner(claimId, msg.sender);
        if (block.timestamp > claim.choiceDeadline) revert ChoiceWindowExpired(claimId, claim.choiceDeadline);
        _settleClaim(claimId, claim, selectedIndex, to);
    }

    function settleDefault(uint256 claimId) external nonReentrant whenNotPaused {
        Claim storage claim = _claimFor(claimId);
        _requireStatus(claimId, claim, ClaimStatus.AwaitingChoice);
        if (block.timestamp <= claim.choiceDeadline) revert ChoiceWindowOpen(claimId, claim.choiceDeadline);
        _settleClaim(claimId, claim, claim.defaultIndex, claim.account);
    }

    function cancelExpired(uint256 claimId) external nonReentrant {
        Claim storage claim = _claimFor(claimId);
        _requireStatus(claimId, claim, ClaimStatus.PendingRandomness);
        uint256 availableAt = claim.createdAt + RANDOMNESS_TIMEOUT;
        if (block.timestamp <= availableAt) revert RandomnessTimeoutNotReached(claimId, availableAt);
        (bool ready,) = randomnessProvider.readRandomness(claim.requestId);
        if (ready) revert RandomnessAlreadyReady(claimId);

        claim.status = ClaimStatus.Cancelled;
        tierPool.cancelClaim(claimId);
        tradeInVault.returnClaim(claimId, claim.account, _claimTradeIns[claimId]);
        bytes32 refundContext = keccak256(abi.encode("VAULT_FORGE_REFUND", address(this), claimId));
        dustLedger.restore(claim.account, claim.dustAmounts, refundContext);
        refundCredit[claim.account] += claim.fee;
        totalClaimsByRecipe[claim.recipeKind] -= 1;
        walletClaimsByRecipe[claim.recipeKind][claim.account] -= 1;
        if (_isAscension(claim.recipeKind)) delete activeAscensionClaim[claim.account];

        emit ClaimCancelled(claimId, claim.account);
    }

    function exchangeDust(DustLedger.DustKind fromKind, DustLedger.DustKind toKind)
        external
        nonReentrant
        whenNotPaused
    {
        if (exchangeMagicCost == 0) revert DustExchangeUnavailable();
        if (fromKind == DustLedger.DustKind.Magic || toKind == DustLedger.DustKind.Magic || fromKind == toKind) {
            revert InvalidDustExchange();
        }

        uint256 nonce = ++dustExchangeNonces[msg.sender];
        uint256[4] memory spendAmounts;
        spendAmounts[uint256(DustLedger.DustKind.Magic)] = exchangeMagicCost;
        spendAmounts[uint256(fromKind)] = exchangeInputAmount;
        bytes32 spendContext = keccak256(abi.encode("DUST_EXCHANGE_SPEND", address(this), msg.sender, nonce));
        dustLedger.spend(msg.sender, spendAmounts, spendContext);

        uint256[4] memory outputAmounts;
        outputAmounts[uint256(toKind)] = exchangeOutputAmount;
        bytes32 creditContext = keccak256(abi.encode("DUST_EXCHANGE_CREDIT", address(this), msg.sender, nonce));
        dustLedger.credit(msg.sender, outputAmounts, creditContext);
        emit DustExchanged(msg.sender, fromKind, toKind, exchangeInputAmount, exchangeOutputAmount);
    }

    function getClaimTradeIns(uint256 claimId) external view returns (uint256[] memory) {
        return _claimTradeIns[claimId];
    }

    function getRecipeConfig(RecipeKind recipeKind) external view returns (RecipeConfig memory) {
        return recipeConfigs[recipeKind];
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return _claimFor(claimId);
    }

    function getClaimCandidates(uint256 claimId) external view returns (uint256[] memory) {
        return tierPool.getClaimCandidates(claimId);
    }

    function withdrawTreasuryFees(address payable to) external nonReentrant {
        if (msg.sender != treasury) revert TreasuryCreditUnavailable(msg.sender);
        if (to == address(0)) revert InvalidAddress();
        uint256 amount = treasuryFeesCredit[msg.sender];
        if (amount == 0) revert TreasuryCreditUnavailable(msg.sender);
        treasuryFeesCredit[msg.sender] = 0;
        _sendNative(to, amount);
        emit TreasuryFeesWithdrawn(msg.sender, to, amount);
    }

    function withdrawRefund(address payable to) external nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        uint256 amount = refundCredit[msg.sender];
        if (amount == 0) revert RefundUnavailable(msg.sender);
        refundCredit[msg.sender] = 0;
        _sendNative(to, amount);
        emit RefundWithdrawn(msg.sender, to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateCraftInputs(
        RecipeKind recipeKind,
        uint256 anchorTokenId,
        uint256[] calldata tradeInTokenIds,
        uint256[] calldata duplicateProofTokenIds
    ) private view returns (uint8 inputTier, uint8 outputTier, bytes32 setKey, bytes32 excludedCanonicalKey) {
        CollectibleForgePolicy.TokenPolicy memory firstPolicy;
        for (uint256 index = 0; index < tradeInTokenIds.length; index++) {
            uint256 tokenId = tradeInTokenIds[index];
            for (uint256 previous = 0; previous < index; previous++) {
                if (tradeInTokenIds[previous] == tokenId) revert DuplicateTradeInToken(tokenId);
            }
            if (itemToken.tokenKind(tokenId) != ItemToken.TokenKind.Inventory || itemToken.balanceOf(msg.sender, tokenId) < 1) {
                revert InvalidTradeInToken(tokenId);
            }
            if (inventoryRegistry.isGrailProtectedToken(tokenId)) revert GrailTradeInBlocked(tokenId);
            CollectibleForgePolicy.TokenPolicy memory policy = collectiblePolicy.getTokenPolicy(tokenId);
            if (!policy.tradeInEligible) revert InvalidTradeInToken(tokenId);
            _validateDuplicateProof(
                tokenId,
                duplicateProofTokenIds[index],
                tradeInTokenIds,
                policy.canonicalKey
            );
            if (index == 0) {
                firstPolicy = policy;
                inputTier = policy.tier;
            } else if (policy.tier != inputTier) {
                revert TradeInTierMismatch(tokenId, inputTier, policy.tier);
            }
            if (recipeKind == RecipeKind.SetAscension && index > 0 && policy.setKey != firstPolicy.setKey) {
                revert SetMismatch(tokenId, firstPolicy.setKey, policy.setKey);
            }
        }

        if (recipeKind == RecipeKind.Recast || recipeKind == RecipeKind.GuidedRecast) {
            outputTier = inputTier;
            excludedCanonicalKey = firstPolicy.canonicalKey;
            return (inputTier, outputTier, bytes32(0), excludedCanonicalKey);
        }

        if (anchorTokenId == 0 || itemToken.balanceOf(msg.sender, anchorTokenId) < 1) {
            revert MissingAnchor(anchorTokenId);
        }
        if (itemToken.tokenKind(anchorTokenId) != ItemToken.TokenKind.Inventory) revert MissingAnchor(anchorTokenId);
        CollectibleForgePolicy.TokenPolicy memory anchorPolicy = collectiblePolicy.getTokenPolicy(anchorTokenId);
        if (anchorPolicy.tier != inputTier) {
            revert AnchorTierMismatch(anchorTokenId, inputTier, anchorPolicy.tier);
        }
        uint256 activeClaim = activeAscensionClaim[msg.sender];
        if (activeClaim != 0) revert ActiveAscensionExists(msg.sender, activeClaim);
        uint8 passportRank = passport.rankOf(msg.sender);
        if (passportRank != inputTier) revert PassportTierMismatch(msg.sender, passportRank, inputTier);
        if (inputTier >= passport.MAX_RANK()) revert PassportTierMismatch(msg.sender, passportRank, inputTier);

        outputTier = inputTier + 1;
        setKey = recipeKind == RecipeKind.SetAscension ? firstPolicy.setKey : bytes32(0);
    }

    function _createClaim(
        uint256 claimId,
        RecipeKind recipeKind,
        uint256 anchorTokenId,
        uint256[] calldata tradeInTokenIds,
        bytes32 imprintHash,
        RecipeConfig memory config,
        CraftContext memory context
    ) private {
        dustLedger.spend(
            msg.sender,
            config.dustAmounts,
            keccak256(abi.encode("VAULT_FORGE_SPEND", address(this), claimId))
        );
        context.requestId = keccak256(abi.encode(address(this), claimId, msg.sender, block.chainid));
        _storeClaim(claimId, recipeKind, anchorTokenId, imprintHash, config, context);
        _transferTradeIns(claimId, tradeInTokenIds);
        randomnessProvider.requestRandomness(context.requestId);

        totalClaimsByRecipe[recipeKind] += 1;
        walletClaimsByRecipe[recipeKind][msg.sender] += 1;
        if (_isAscension(recipeKind)) activeAscensionClaim[msg.sender] = claimId;
        emit ClaimCreated(
            claimId,
            msg.sender,
            recipeKind,
            context.inputTier,
            context.outputTier,
            anchorTokenId,
            context.requestId
        );
    }

    function _prepareCraftContext(
        uint256 claimId,
        RecipeKind recipeKind,
        uint256 anchorTokenId,
        uint256[] calldata tradeInTokenIds,
        uint256[] calldata duplicateProofTokenIds,
        uint8 optionCount
    ) private returns (CraftContext memory context) {
        bytes32 setKey;
        bytes32 excludedCanonicalKey;
        (context.inputTier, context.outputTier, setKey, excludedCanonicalKey) =
            _validateCraftInputs(recipeKind, anchorTokenId, tradeInTokenIds, duplicateProofTokenIds);
        context.poolKey = tierPool.reserveClaim(
            claimId,
            context.outputTier,
            setKey,
            optionCount,
            excludedCanonicalKey
        );
    }

    function _storeClaim(
        uint256 claimId,
        RecipeKind recipeKind,
        uint256 anchorTokenId,
        bytes32 imprintHash,
        RecipeConfig memory config,
        CraftContext memory context
    ) private {
        Claim storage claim = _claims[claimId];
        claim.account = msg.sender;
        claim.anchorTokenId = anchorTokenId;
        claim.fee = msg.value;
        claim.createdAt = block.timestamp;
        claim.requestId = context.requestId;
        claim.poolKey = context.poolKey;
        claim.imprintHash = imprintHash;
        claim.dustAmounts = config.dustAmounts;
        claim.recipeKind = recipeKind;
        claim.status = ClaimStatus.PendingRandomness;
        claim.inputTier = context.inputTier;
        claim.outputTier = context.outputTier;
        claim.optionCount = config.optionCount;
    }

    function _transferTradeIns(uint256 claimId, uint256[] calldata tradeInTokenIds) private {
        for (uint256 index = 0; index < tradeInTokenIds.length; index++) {
            uint256 tokenId = tradeInTokenIds[index];
            _claimTradeIns[claimId].push(tokenId);
            itemToken.safeTransferFrom(msg.sender, address(tradeInVault), tokenId, 1, abi.encode(claimId));
        }
    }

    function _validateDuplicateProof(
        uint256 tradeInTokenId,
        uint256 proofTokenId,
        uint256[] calldata tradeInTokenIds,
        bytes32 expectedCanonicalKey
    ) private view {
        if (
            proofTokenId == 0 || proofTokenId == tradeInTokenId
                || itemToken.tokenKind(proofTokenId) != ItemToken.TokenKind.Inventory
                || itemToken.balanceOf(msg.sender, proofTokenId) < 1
        ) {
            revert InvalidDuplicateProof(tradeInTokenId, proofTokenId);
        }
        for (uint256 index = 0; index < tradeInTokenIds.length; index++) {
            if (proofTokenId == tradeInTokenIds[index]) {
                revert InvalidDuplicateProof(tradeInTokenId, proofTokenId);
            }
        }
        CollectibleForgePolicy.TokenPolicy memory proofPolicy = collectiblePolicy.getTokenPolicy(proofTokenId);
        if (proofPolicy.canonicalKey != expectedCanonicalKey) {
            revert InvalidDuplicateProof(tradeInTokenId, proofTokenId);
        }
    }

    function _settleClaim(uint256 claimId, Claim storage claim, uint256 selectedIndex, address to) private {
        if (to == address(0)) revert InvalidAddress();
        uint256 outputTokenId = tierPool.releaseClaim(claimId, selectedIndex, to);
        claim.outputTokenId = outputTokenId;
        claim.status = ClaimStatus.Settled;
        tradeInVault.settleClaim(claimId, _claimTradeIns[claimId]);
        treasuryFeesCredit[treasury] += claim.fee;
        if (_isAscension(claim.recipeKind)) {
            passport.advance(claim.account, claim.anchorTokenId, claim.inputTier, claimId);
            delete activeAscensionClaim[claim.account];
        }
        emit ClaimSettled(claimId, claim.account, outputTokenId, claim.recipeKind);
    }

    function _claimFor(uint256 claimId) private view returns (Claim storage claim) {
        claim = _claims[claimId];
        if (claim.account == address(0)) revert ClaimNotFound(claimId);
    }

    function _requireStatus(uint256 claimId, Claim storage claim, ClaimStatus expected) private view {
        if (claim.status != expected) revert InvalidClaimStatus(claimId, expected, claim.status);
    }

    function _recipeShape(RecipeKind recipeKind) private pure returns (uint8 tradeInCount, uint8 optionCount) {
        if (recipeKind == RecipeKind.Recast) return (1, 1);
        if (recipeKind == RecipeKind.GuidedRecast) return (1, 2);
        if (recipeKind == RecipeKind.Ascension) return (2, 1);
        if (recipeKind == RecipeKind.GuidedAscension) return (2, 3);
        return (2, 1);
    }

    function _validateDustShape(RecipeKind recipeKind, uint256[4] calldata amounts) private pure {
        bool hasEcho = amounts[uint256(DustLedger.DustKind.Echo)] != 0;
        bool hasPrism = amounts[uint256(DustLedger.DustKind.Prism)] != 0;
        bool hasStar = amounts[uint256(DustLedger.DustKind.Star)] != 0;
        bool valid;
        if (recipeKind == RecipeKind.Recast) valid = hasEcho && !hasPrism && !hasStar;
        else if (recipeKind == RecipeKind.GuidedRecast) valid = hasEcho && !hasPrism && hasStar;
        else if (recipeKind == RecipeKind.Ascension) valid = hasEcho && hasPrism && !hasStar;
        else valid = hasEcho && hasPrism && hasStar;
        if (!valid) revert InvalidRecipeConfig(recipeKind);
    }

    function _isAscension(RecipeKind recipeKind) private pure returns (bool) {
        return recipeKind == RecipeKind.Ascension || recipeKind == RecipeKind.GuidedAscension
            || recipeKind == RecipeKind.SetAscension;
    }

    function _sendNative(address payable to, uint256 amount) private {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed(to, amount);
    }
}
