// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract DustRewardPolicy is AccessControl {
    bytes32 public constant POLICY_ADMIN_ROLE = keccak256("POLICY_ADMIN_ROLE");
    uint16 public constant WEIGHT_DENOMINATOR = 10_000;
    uint8 public constant MAX_SPECIALTY_ROLLS = 8;

    struct Policy {
        uint256 magicAmount;
        uint256 specialtyAmount;
        uint8 specialtyRolls;
        uint16 echoWeight;
        uint16 prismWeight;
        uint16 starWeight;
        bool active;
        bool exists;
    }

    error InvalidPolicy();
    error PolicyNotFound(uint256 policyId);
    error PolicyAlreadyInactive(uint256 policyId);

    event PolicyCreated(
        uint256 indexed policyId,
        uint256 magicAmount,
        uint256 specialtyAmount,
        uint8 specialtyRolls,
        uint16 echoWeight,
        uint16 prismWeight,
        uint16 starWeight
    );
    event PolicyDeactivated(uint256 indexed policyId);

    uint256 public nextPolicyId = 1;
    mapping(uint256 policyId => Policy policy) private _policies;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createPolicy(
        uint256 magicAmount,
        uint256 specialtyAmount,
        uint8 specialtyRolls,
        uint16 echoWeight,
        uint16 prismWeight,
        uint16 starWeight
    ) external onlyRole(POLICY_ADMIN_ROLE) returns (uint256 policyId) {
        if (
            magicAmount == 0 || specialtyAmount == 0 || specialtyRolls == 0
                || specialtyRolls > MAX_SPECIALTY_ROLLS
                || uint256(echoWeight) + uint256(prismWeight) + uint256(starWeight) != WEIGHT_DENOMINATOR
        ) {
            revert InvalidPolicy();
        }

        policyId = nextPolicyId++;
        _policies[policyId] = Policy({
            magicAmount: magicAmount,
            specialtyAmount: specialtyAmount,
            specialtyRolls: specialtyRolls,
            echoWeight: echoWeight,
            prismWeight: prismWeight,
            starWeight: starWeight,
            active: true,
            exists: true
        });

        emit PolicyCreated(
            policyId,
            magicAmount,
            specialtyAmount,
            specialtyRolls,
            echoWeight,
            prismWeight,
            starWeight
        );
    }

    function deactivatePolicy(uint256 policyId) external onlyRole(POLICY_ADMIN_ROLE) {
        Policy storage policy = _policyFor(policyId);
        if (!policy.active) revert PolicyAlreadyInactive(policyId);
        policy.active = false;
        emit PolicyDeactivated(policyId);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policyFor(policyId);
    }

    function _policyFor(uint256 policyId) private view returns (Policy storage policy) {
        policy = _policies[policyId];
        if (!policy.exists) revert PolicyNotFound(policyId);
    }
}
