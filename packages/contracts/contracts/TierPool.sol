// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CollectibleForgePolicy} from "./CollectibleForgePolicy.sol";
import {InventoryRegistry} from "./InventoryRegistry.sol";
import {ItemToken} from "./ItemToken.sol";

contract TierPool is AccessControl, ERC1155Holder, Pausable, ReentrancyGuard {
    bytes32 public constant POOL_ADMIN_ROLE = keccak256("POOL_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_POOL_TOKENS = 256;

    struct Pool {
        uint8 tier;
        bytes32 setKey;
        uint256 reservedOptions;
        bool exists;
    }

    struct Reservation {
        bytes32 poolKey;
        bytes32 excludedCanonicalKey;
        uint8 optionCount;
        bool prepared;
        bool exists;
    }

    error InvalidAddress();
    error ForgeAlreadyConfigured();
    error UnauthorizedForge(address caller);
    error InvalidPool();
    error PoolCapacityReached(bytes32 poolKey);
    error TokenAlreadyPooled(uint256 tokenId);
    error TokenNotPoolEligible(uint256 tokenId);
    error InventoryNotRedeemable(uint256 tokenId);
    error PoolPolicyMismatch(uint256 tokenId, bytes32 poolKey);
    error UnexpectedERC1155Received();
    error UnexpectedERC1155BatchReceived();
    error ReservationExists(uint256 claimId);
    error ReservationNotFound(uint256 claimId);
    error ReservationAlreadyPrepared(uint256 claimId);
    error InsufficientPoolInventory(bytes32 poolKey, uint256 required, uint256 available);
    error InvalidSelection(uint256 claimId, uint256 selectedIndex);
    error TokenReservationConflict(bytes32 poolKey);

    event ForgeConfigured(address indexed forge);
    event PoolTokenDeposited(bytes32 indexed poolKey, uint256 indexed tokenId, uint8 tier, bytes32 setKey);
    event PoolInventoryOnboarded(bytes32 indexed poolKey, uint256 indexed tokenId, string inventoryId);
    event PoolTokenWithdrawn(bytes32 indexed poolKey, uint256 indexed tokenId, address indexed to);
    event ClaimReserved(uint256 indexed claimId, bytes32 indexed poolKey, uint8 optionCount);
    event ClaimCandidatesPrepared(uint256 indexed claimId, uint256[] tokenIds);
    event ClaimReleased(uint256 indexed claimId, uint256 indexed selectedTokenId, address indexed to);
    event ClaimReservationCancelled(uint256 indexed claimId);

    ItemToken public immutable itemToken;
    CollectibleForgePolicy public immutable collectiblePolicy;
    InventoryRegistry public immutable inventoryRegistry;
    address public forge;

    mapping(bytes32 poolKey => Pool pool) public pools;
    mapping(bytes32 poolKey => uint256[] tokenIds) private _poolTokens;
    mapping(bytes32 poolKey => uint256 tokenCount) public managedTokenCount;
    mapping(uint256 tokenId => bytes32 poolKey) public tokenPoolKey;
    mapping(uint256 tokenId => uint256 indexPlusOne) private _tokenIndexPlusOne;
    mapping(uint256 tokenId => bytes32 canonicalKey) private _tokenCanonicalKey;
    mapping(bytes32 poolKey => mapping(bytes32 canonicalKey => uint256 count)) private _poolCanonicalCounts;
    mapping(uint256 claimId => Reservation reservation) public reservations;
    mapping(uint256 claimId => uint256[] tokenIds) private _claimCandidates;
    mapping(bytes32 poolKey => mapping(bytes32 canonicalKey => uint256 optionCount))
        private _excludedOptionDemand;
    mapping(bytes32 poolKey => bytes32[] canonicalKeys) private _activeExcludedCanonicalKeys;
    mapping(bytes32 poolKey => mapping(bytes32 canonicalKey => uint256 indexPlusOne))
        private _activeExcludedCanonicalKeyIndexPlusOne;

    bool private _acceptingDeposit;
    address private _depositFrom;
    uint256 private _depositTokenId;

    constructor(ItemToken itemToken_, CollectibleForgePolicy collectiblePolicy_) {
        if (address(itemToken_) == address(0) || address(collectiblePolicy_) == address(0)) {
            revert InvalidAddress();
        }
        itemToken = itemToken_;
        collectiblePolicy = collectiblePolicy_;
        inventoryRegistry = collectiblePolicy_.inventoryRegistry();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyForge() {
        if (msg.sender != forge) revert UnauthorizedForge(msg.sender);
        _;
    }

    function configureForge(address forge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (forge_ == address(0)) revert InvalidAddress();
        if (forge != address(0)) revert ForgeAlreadyConfigured();
        forge = forge_;
        emit ForgeConfigured(forge_);
    }

    function poolKeyFor(uint8 tier, bytes32 setKey) public pure returns (bytes32) {
        if (tier == 0) revert InvalidPool();
        return keccak256(abi.encode(tier, setKey));
    }

    function deposit(uint256 tokenId, bool setFocused) external onlyRole(POOL_ADMIN_ROLE) nonReentrant whenNotPaused {
        if (tokenPoolKey[tokenId] != bytes32(0)) revert TokenAlreadyPooled(tokenId);
        CollectibleForgePolicy.TokenPolicy memory policy = collectiblePolicy.getTokenPolicy(tokenId);
        if (!policy.tierPoolEligible) revert TokenNotPoolEligible(tokenId);
        (bytes32 poolKey, bytes32 setKey) = _preparePool(policy, setFocused);

        _acceptingDeposit = true;
        _depositFrom = msg.sender;
        _depositTokenId = tokenId;
        itemToken.safeTransferFrom(msg.sender, address(this), tokenId, 1, "");
        _acceptingDeposit = false;
        _depositFrom = address(0);
        _depositTokenId = 0;

        managedTokenCount[poolKey] += 1;
        _addToken(poolKey, tokenId);
        emit PoolTokenDeposited(poolKey, tokenId, policy.tier, setKey);
    }

    function onboardInventory(string calldata inventoryId, bool setFocused)
        external
        onlyRole(POOL_ADMIN_ROLE)
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        InventoryRegistry.InventoryRecord memory record = inventoryRegistry.getInventory(inventoryId);
        tokenId = record.tokenId;
        if (!record.redeemable) revert InventoryNotRedeemable(tokenId);
        if (tokenPoolKey[tokenId] != bytes32(0)) revert TokenAlreadyPooled(tokenId);
        CollectibleForgePolicy.TokenPolicy memory policy = collectiblePolicy.getTokenPolicy(tokenId);
        if (!policy.tierPoolEligible) revert TokenNotPoolEligible(tokenId);
        (bytes32 poolKey, bytes32 setKey) = _preparePool(policy, setFocused);

        _acceptingDeposit = true;
        _depositFrom = address(0);
        _depositTokenId = tokenId;
        inventoryRegistry.markTokenized(inventoryId, address(this));
        itemToken.mintInventoryItem(address(this), tokenId, inventoryId, record.metadataUri);
        _acceptingDeposit = false;
        _depositTokenId = 0;

        managedTokenCount[poolKey] += 1;
        _addToken(poolKey, tokenId);
        emit PoolTokenDeposited(poolKey, tokenId, policy.tier, setKey);
        emit PoolInventoryOnboarded(poolKey, tokenId, inventoryId);
    }

    function withdrawAvailable(uint256 tokenId, address to)
        external
        onlyRole(POOL_ADMIN_ROLE)
        nonReentrant
        whenNotPaused
    {
        if (to == address(0)) revert InvalidAddress();
        bytes32 poolKey = tokenPoolKey[tokenId];
        Pool storage pool = pools[poolKey];
        if (poolKey == bytes32(0) || pool.reservedOptions != 0) {
            revert TokenReservationConflict(poolKey);
        }
        _removeToken(poolKey, tokenId);
        managedTokenCount[poolKey] -= 1;
        itemToken.safeTransferFrom(address(this), to, tokenId, 1, "");
        emit PoolTokenWithdrawn(poolKey, tokenId, to);
    }

    function reserveClaim(
        uint256 claimId,
        uint8 tier,
        bytes32 setKey,
        uint8 optionCount,
        bytes32 excludedCanonicalKey
    ) external onlyForge whenNotPaused returns (bytes32 poolKey) {
        if (claimId == 0 || optionCount == 0 || optionCount > 3) revert InvalidPool();
        if (reservations[claimId].exists) revert ReservationExists(claimId);
        poolKey = poolKeyFor(tier, setKey);
        Pool storage pool = pools[poolKey];
        if (!pool.exists) revert InsufficientPoolInventory(poolKey, optionCount, 0);

        // Each claim excludes at most one canonical identity, so solvency reduces to
        // total capacity plus one capacity constraint for every active exclusion.
        uint256 required = pool.reservedOptions + optionCount;
        uint256 available = _poolTokens[poolKey].length;
        if (available < required) revert InsufficientPoolInventory(poolKey, required, available);

        if (excludedCanonicalKey != bytes32(0)) {
            uint256 excludedDemand = _excludedOptionDemand[poolKey][excludedCanonicalKey] + optionCount;
            uint256 eligible = _eligibleCount(poolKey, excludedCanonicalKey);
            if (eligible < excludedDemand) {
                revert InsufficientPoolInventory(poolKey, excludedDemand, eligible);
            }
        }

        pool.reservedOptions += optionCount;
        _increaseExcludedOptionDemand(poolKey, excludedCanonicalKey, optionCount);
        reservations[claimId] = Reservation({
            poolKey: poolKey,
            excludedCanonicalKey: excludedCanonicalKey,
            optionCount: optionCount,
            prepared: false,
            exists: true
        });
        emit ClaimReserved(claimId, poolKey, optionCount);
    }

    function prepareClaim(uint256 claimId, uint256 randomness)
        external
        onlyForge
        whenNotPaused
        returns (uint256[] memory candidates)
    {
        Reservation storage reservation = reservations[claimId];
        if (!reservation.exists) revert ReservationNotFound(claimId);
        if (reservation.prepared) revert ReservationAlreadyPrepared(claimId);
        reservation.prepared = true;
        Pool storage pool = pools[reservation.poolKey];

        for (uint256 optionIndex = 0; optionIndex < reservation.optionCount; optionIndex++) {
            pool.reservedOptions -= 1;
            _decreaseExcludedOptionDemand(reservation.poolKey, reservation.excludedCanonicalKey, 1);

            bytes32 requiredCanonicalKey = _requiredCanonicalKey(reservation.poolKey);
            uint256 eligible = _candidateCount(
                reservation.poolKey,
                reservation.excludedCanonicalKey,
                requiredCanonicalKey
            );
            if (eligible == 0) {
                revert InsufficientPoolInventory(reservation.poolKey, 1, 0);
            }
            uint256 selectedEligibleIndex = randomness % eligible;
            uint256 tokenId = _candidateTokenAt(
                reservation.poolKey,
                reservation.excludedCanonicalKey,
                requiredCanonicalKey,
                selectedEligibleIndex
            );
            _removeToken(reservation.poolKey, tokenId);
            _claimCandidates[claimId].push(tokenId);
            randomness = uint256(keccak256(abi.encode(randomness, claimId, optionIndex, tokenId)));
        }

        candidates = _claimCandidates[claimId];
        emit ClaimCandidatesPrepared(claimId, candidates);
    }

    function releaseClaim(uint256 claimId, uint256 selectedIndex, address to)
        external
        onlyForge
        nonReentrant
        returns (uint256 selectedTokenId)
    {
        if (to == address(0)) revert InvalidAddress();
        Reservation storage reservation = reservations[claimId];
        uint256[] storage candidates = _claimCandidates[claimId];
        if (!reservation.exists || !reservation.prepared) revert ReservationNotFound(claimId);
        if (selectedIndex >= candidates.length) revert InvalidSelection(claimId, selectedIndex);

        bytes32 poolKey = reservation.poolKey;
        selectedTokenId = candidates[selectedIndex];
        for (uint256 index = 0; index < candidates.length; index++) {
            if (index != selectedIndex) _addToken(poolKey, candidates[index]);
        }
        delete _claimCandidates[claimId];
        delete reservations[claimId];
        managedTokenCount[poolKey] -= 1;

        itemToken.safeTransferFrom(address(this), to, selectedTokenId, 1, "");
        emit ClaimReleased(claimId, selectedTokenId, to);
    }

    function cancelClaim(uint256 claimId) external onlyForge {
        Reservation storage reservation = reservations[claimId];
        if (!reservation.exists) revert ReservationNotFound(claimId);
        if (reservation.prepared) {
            uint256[] storage candidates = _claimCandidates[claimId];
            for (uint256 index = 0; index < candidates.length; index++) {
                _addToken(reservation.poolKey, candidates[index]);
            }
            delete _claimCandidates[claimId];
        } else {
            pools[reservation.poolKey].reservedOptions -= reservation.optionCount;
            _decreaseExcludedOptionDemand(
                reservation.poolKey,
                reservation.excludedCanonicalKey,
                reservation.optionCount
            );
        }
        delete reservations[claimId];
        emit ClaimReservationCancelled(claimId);
    }

    function getPoolTokens(bytes32 poolKey) external view returns (uint256[] memory) {
        return _poolTokens[poolKey];
    }

    function getClaimCandidates(uint256 claimId) external view returns (uint256[] memory) {
        return _claimCandidates[claimId];
    }

    function availableCount(uint8 tier, bytes32 setKey) external view returns (uint256) {
        bytes32 poolKey = poolKeyFor(tier, setKey);
        return _poolTokens[poolKey].length - pools[poolKey].reservedOptions;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes memory
    ) public view override returns (bytes4) {
        if (
            msg.sender != address(itemToken) || !_acceptingDeposit || operator != address(this)
                || from != _depositFrom || id != _depositTokenId || value != 1
        ) {
            revert UnexpectedERC1155Received();
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override returns (bytes4) {
        revert UnexpectedERC1155BatchReceived();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _eligibleCount(bytes32 poolKey, bytes32 excludedCanonicalKey) private view returns (uint256) {
        uint256 tokenCount = _poolTokens[poolKey].length;
        if (excludedCanonicalKey == bytes32(0)) return tokenCount;
        return tokenCount - _poolCanonicalCounts[poolKey][excludedCanonicalKey];
    }

    function _preparePool(CollectibleForgePolicy.TokenPolicy memory policy, bool setFocused)
        private
        returns (bytes32 poolKey, bytes32 setKey)
    {
        setKey = setFocused ? policy.setKey : bytes32(0);
        poolKey = poolKeyFor(policy.tier, setKey);
        if (managedTokenCount[poolKey] >= MAX_POOL_TOKENS) revert PoolCapacityReached(poolKey);

        Pool storage pool = pools[poolKey];
        if (!pool.exists) {
            pool.tier = policy.tier;
            pool.setKey = setKey;
            pool.exists = true;
        }
    }

    function _candidateCount(bytes32 poolKey, bytes32 excludedCanonicalKey, bytes32 requiredCanonicalKey)
        private
        view
        returns (uint256)
    {
        if (requiredCanonicalKey == bytes32(0)) return _eligibleCount(poolKey, excludedCanonicalKey);
        if (requiredCanonicalKey == excludedCanonicalKey) return 0;
        return _poolCanonicalCounts[poolKey][requiredCanonicalKey];
    }

    function _candidateTokenAt(
        bytes32 poolKey,
        bytes32 excludedCanonicalKey,
        bytes32 requiredCanonicalKey,
        uint256 targetIndex
    ) private view returns (uint256 tokenId)
    {
        uint256[] storage tokens = _poolTokens[poolKey];
        uint256 currentIndex;
        for (uint256 index = 0; index < tokens.length; index++) {
            uint256 candidate = tokens[index];
            bytes32 canonicalKey = _tokenCanonicalKey[candidate];
            if (requiredCanonicalKey != bytes32(0)) {
                if (canonicalKey != requiredCanonicalKey) continue;
            } else if (excludedCanonicalKey != bytes32(0) && canonicalKey == excludedCanonicalKey) {
                continue;
            }
            if (currentIndex == targetIndex) return candidate;
            currentIndex++;
        }
        revert InsufficientPoolInventory(poolKey, targetIndex + 1, currentIndex);
    }

    // A tight "exclude K" obligation needs every token outside K, so this draw must consume K.
    function _requiredCanonicalKey(bytes32 poolKey) private view returns (bytes32 requiredCanonicalKey) {
        bytes32[] storage excludedCanonicalKeys = _activeExcludedCanonicalKeys[poolKey];
        for (uint256 index = 0; index < excludedCanonicalKeys.length; index++) {
            bytes32 canonicalKey = excludedCanonicalKeys[index];
            uint256 demand = _excludedOptionDemand[poolKey][canonicalKey];
            uint256 eligible = _eligibleCount(poolKey, canonicalKey);
            if (demand > eligible) revert InsufficientPoolInventory(poolKey, demand, eligible);
            if (demand == eligible) {
                if (requiredCanonicalKey != bytes32(0) && requiredCanonicalKey != canonicalKey) {
                    revert InsufficientPoolInventory(
                        poolKey,
                        pools[poolKey].reservedOptions,
                        _poolTokens[poolKey].length
                    );
                }
                requiredCanonicalKey = canonicalKey;
            }
        }
    }

    function _increaseExcludedOptionDemand(bytes32 poolKey, bytes32 canonicalKey, uint256 amount) private {
        if (canonicalKey == bytes32(0)) return;
        uint256 demand = _excludedOptionDemand[poolKey][canonicalKey];
        if (demand == 0) {
            _activeExcludedCanonicalKeys[poolKey].push(canonicalKey);
            _activeExcludedCanonicalKeyIndexPlusOne[poolKey][canonicalKey] =
                _activeExcludedCanonicalKeys[poolKey].length;
        }
        _excludedOptionDemand[poolKey][canonicalKey] = demand + amount;
    }

    function _decreaseExcludedOptionDemand(bytes32 poolKey, bytes32 canonicalKey, uint256 amount) private {
        if (canonicalKey == bytes32(0)) return;
        uint256 remaining = _excludedOptionDemand[poolKey][canonicalKey] - amount;
        if (remaining != 0) {
            _excludedOptionDemand[poolKey][canonicalKey] = remaining;
            return;
        }

        delete _excludedOptionDemand[poolKey][canonicalKey];
        uint256 index = _activeExcludedCanonicalKeyIndexPlusOne[poolKey][canonicalKey] - 1;
        uint256 lastIndex = _activeExcludedCanonicalKeys[poolKey].length - 1;
        if (index != lastIndex) {
            bytes32 lastCanonicalKey = _activeExcludedCanonicalKeys[poolKey][lastIndex];
            _activeExcludedCanonicalKeys[poolKey][index] = lastCanonicalKey;
            _activeExcludedCanonicalKeyIndexPlusOne[poolKey][lastCanonicalKey] = index + 1;
        }
        _activeExcludedCanonicalKeys[poolKey].pop();
        delete _activeExcludedCanonicalKeyIndexPlusOne[poolKey][canonicalKey];
    }

    function _addToken(bytes32 poolKey, uint256 tokenId) private {
        if (tokenPoolKey[tokenId] != bytes32(0)) revert TokenAlreadyPooled(tokenId);
        bytes32 canonicalKey = _tokenCanonicalKey[tokenId];
        if (canonicalKey == bytes32(0)) {
            canonicalKey = collectiblePolicy.getTokenPolicy(tokenId).canonicalKey;
            _tokenCanonicalKey[tokenId] = canonicalKey;
        }
        _poolTokens[poolKey].push(tokenId);
        tokenPoolKey[tokenId] = poolKey;
        _tokenIndexPlusOne[tokenId] = _poolTokens[poolKey].length;
        _poolCanonicalCounts[poolKey][canonicalKey] += 1;
    }

    function _removeToken(bytes32 poolKey, uint256 tokenId) private {
        if (tokenPoolKey[tokenId] != poolKey) revert PoolPolicyMismatch(tokenId, poolKey);
        _poolCanonicalCounts[poolKey][_tokenCanonicalKey[tokenId]] -= 1;
        uint256 index = _tokenIndexPlusOne[tokenId] - 1;
        uint256 lastIndex = _poolTokens[poolKey].length - 1;
        if (index != lastIndex) {
            uint256 lastTokenId = _poolTokens[poolKey][lastIndex];
            _poolTokens[poolKey][index] = lastTokenId;
            _tokenIndexPlusOne[lastTokenId] = index + 1;
        }
        _poolTokens[poolKey].pop();
        delete tokenPoolKey[tokenId];
        delete _tokenIndexPlusOne[tokenId];
    }
}
