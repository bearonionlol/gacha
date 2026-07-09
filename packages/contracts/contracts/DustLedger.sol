// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract DustLedger is AccessControl, Pausable {
    enum DustKind {
        Magic,
        Echo,
        Prism,
        Star
    }

    bytes32 public constant CREDIT_ROLE = keccak256("CREDIT_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");
    bytes32 public constant RESTORER_ROLE = keccak256("RESTORER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error InvalidAddress();
    error EmptyAmounts();
    error ZeroContext();
    error CreditContextUsed(bytes32 contextId);
    error SpendContextUsed(bytes32 contextId);
    error RestoreContextUsed(bytes32 contextId);
    error InsufficientDust(address account, DustKind kind, uint256 required, uint256 available);

    event DustCredited(address indexed account, bytes32 indexed contextId, uint256[4] amounts);
    event DustSpent(address indexed account, bytes32 indexed contextId, uint256[4] amounts);
    event DustRestored(address indexed account, bytes32 indexed contextId, uint256[4] amounts);

    mapping(address account => mapping(DustKind kind => uint256 amount)) private _balances;
    mapping(address account => mapping(DustKind kind => uint256 amount)) public totalCredited;
    mapping(address account => mapping(DustKind kind => uint256 amount)) public totalSpent;
    mapping(address account => mapping(DustKind kind => uint256 amount)) public totalRestored;
    mapping(bytes32 contextId => bool used) public usedCreditContexts;
    mapping(bytes32 contextId => bool used) public usedSpendContexts;
    mapping(bytes32 contextId => bool used) public usedRestoreContexts;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function balanceOf(address account, DustKind kind) external view returns (uint256) {
        return _balances[account][kind];
    }

    function balancesOf(address account) external view returns (uint256[4] memory amounts) {
        for (uint256 index = 0; index < 4; index++) {
            amounts[index] = _balances[account][DustKind(index)];
        }
    }

    function credit(address account, uint256[4] calldata amounts, bytes32 contextId)
        external
        onlyRole(CREDIT_ROLE)
        whenNotPaused
    {
        if (account == address(0)) revert InvalidAddress();
        if (contextId == bytes32(0)) revert ZeroContext();
        if (usedCreditContexts[contextId]) revert CreditContextUsed(contextId);
        if (!_hasAmount(amounts)) revert EmptyAmounts();

        usedCreditContexts[contextId] = true;
        for (uint256 index = 0; index < 4; index++) {
            uint256 amount = amounts[index];
            if (amount == 0) continue;
            DustKind kind = DustKind(index);
            _balances[account][kind] += amount;
            totalCredited[account][kind] += amount;
        }

        emit DustCredited(account, contextId, amounts);
    }

    function spend(address account, uint256[4] calldata amounts, bytes32 contextId)
        external
        onlyRole(SPENDER_ROLE)
        whenNotPaused
    {
        if (account == address(0)) revert InvalidAddress();
        if (contextId == bytes32(0)) revert ZeroContext();
        if (usedSpendContexts[contextId]) revert SpendContextUsed(contextId);
        if (!_hasAmount(amounts)) revert EmptyAmounts();

        for (uint256 index = 0; index < 4; index++) {
            uint256 required = amounts[index];
            if (required == 0) continue;
            DustKind kind = DustKind(index);
            uint256 available = _balances[account][kind];
            if (available < required) {
                revert InsufficientDust(account, kind, required, available);
            }
        }

        usedSpendContexts[contextId] = true;
        for (uint256 index = 0; index < 4; index++) {
            uint256 amount = amounts[index];
            if (amount == 0) continue;
            DustKind kind = DustKind(index);
            _balances[account][kind] -= amount;
            totalSpent[account][kind] += amount;
        }

        emit DustSpent(account, contextId, amounts);
    }

    function restore(address account, uint256[4] calldata amounts, bytes32 contextId)
        external
        onlyRole(RESTORER_ROLE)
    {
        if (account == address(0)) revert InvalidAddress();
        if (contextId == bytes32(0)) revert ZeroContext();
        if (usedRestoreContexts[contextId]) revert RestoreContextUsed(contextId);
        if (!_hasAmount(amounts)) revert EmptyAmounts();

        usedRestoreContexts[contextId] = true;
        for (uint256 index = 0; index < 4; index++) {
            uint256 amount = amounts[index];
            if (amount == 0) continue;
            DustKind kind = DustKind(index);
            _balances[account][kind] += amount;
            totalRestored[account][kind] += amount;
        }

        emit DustRestored(account, contextId, amounts);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _hasAmount(uint256[4] calldata amounts) private pure returns (bool) {
        return amounts[0] != 0 || amounts[1] != 0 || amounts[2] != 0 || amounts[3] != 0;
    }
}
