// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRandomnessProvider} from "./IRandomnessProvider.sol";

contract CommitRevealRandomnessProvider is AccessControl, IRandomnessProvider {
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant REVEALER_ROLE = keccak256("REVEALER_ROLE");

    struct RandomnessRequest {
        bool exists;
        bytes32 commitment;
        bool ready;
        uint256 randomness;
    }

    error ZeroRequestId();
    error RandomnessRequestAlreadyExists(bytes32 requestId);
    error RandomnessRequestNotFound(bytes32 requestId);
    error ZeroCommitment();
    error RandomnessAlreadyCommitted(bytes32 requestId);
    error RandomnessCommitmentMissing(bytes32 requestId);
    error RandomnessSeedMismatch(bytes32 requestId);
    error RandomnessAlreadyRevealed(bytes32 requestId);

    event RandomnessRequested(bytes32 indexed requestId);
    event RandomnessCommitted(bytes32 indexed requestId, bytes32 commitment);
    event RandomnessRevealed(bytes32 indexed requestId, uint256 randomness);

    mapping(bytes32 requestId => RandomnessRequest request) private _requests;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function requestRandomness(bytes32 requestId) external onlyRole(REQUESTER_ROLE) {
        if (requestId == bytes32(0)) {
            revert ZeroRequestId();
        }

        RandomnessRequest storage request = _requests[requestId];
        if (request.exists) {
            revert RandomnessRequestAlreadyExists(requestId);
        }

        request.exists = true;

        emit RandomnessRequested(requestId);
    }

    function commitRandomness(bytes32 requestId, bytes32 commitment) external onlyRole(REVEALER_ROLE) {
        RandomnessRequest storage request = _requestFor(requestId);

        if (commitment == bytes32(0)) {
            revert ZeroCommitment();
        }

        if (request.commitment != bytes32(0)) {
            revert RandomnessAlreadyCommitted(requestId);
        }

        request.commitment = commitment;

        emit RandomnessCommitted(requestId, commitment);
    }

    function revealRandomness(bytes32 requestId, bytes32 seed) external onlyRole(REVEALER_ROLE) {
        RandomnessRequest storage request = _requestFor(requestId);

        if (request.ready) {
            revert RandomnessAlreadyRevealed(requestId);
        }

        if (request.commitment == bytes32(0)) {
            revert RandomnessCommitmentMissing(requestId);
        }

        if (keccak256(abi.encode(seed)) != request.commitment) {
            revert RandomnessSeedMismatch(requestId);
        }

        uint256 randomness = uint256(keccak256(abi.encode(seed, requestId, address(this))));
        if (randomness == 0) {
            randomness = 1;
        }

        request.ready = true;
        request.randomness = randomness;

        emit RandomnessRevealed(requestId, randomness);
    }

    function readRandomness(bytes32 requestId) external view returns (bool ready, uint256 randomness) {
        RandomnessRequest storage request = _requests[requestId];
        return (request.ready, request.randomness);
    }

    function _requestFor(bytes32 requestId) private view returns (RandomnessRequest storage) {
        RandomnessRequest storage request = _requests[requestId];
        if (!request.exists) {
            revert RandomnessRequestNotFound(requestId);
        }

        return request;
    }
}
