// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRandomnessCoordinator} from "./IRandomnessCoordinator.sol";
import {IRandomnessProvider} from "./IRandomnessProvider.sol";

contract CoordinatorRandomnessProvider is AccessControl, ReentrancyGuard, IRandomnessProvider {
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant FUND_ADMIN_ROLE = keccak256("FUND_ADMIN_ROLE");

    struct Result {
        uint256 randomness;
        bool exists;
        bool ready;
    }

    error InvalidAddress();
    error CoordinatorHasNoCode(address coordinator);
    error InvalidCoordinatorCodeHash(bytes32 expected, bytes32 actual);
    error ZeroRequestId();
    error RandomnessRequestAlreadyExists(bytes32 requestId);
    error InvalidCoordinatorRequestId();
    error CoordinatorRequestAlreadyMapped(bytes32 coordinatorRequestId);
    error UnauthorizedCoordinator(address caller);
    error UnknownCoordinatorRequest(bytes32 coordinatorRequestId);
    error ZeroRandomness(bytes32 coordinatorRequestId);
    error RandomnessAlreadyFulfilled(bytes32 requestId);
    error RequestFeeExceedsCap(uint256 fee, uint256 cap);
    error InsufficientRequestFunding(uint256 required, uint256 available);
    error InvalidWithdrawal(address to, uint256 amount);
    error FundingTransferFailed(address to, uint256 amount);

    event RequestFundingReceived(address indexed from, uint256 amount, uint256 balance);
    event RequestFundingWithdrawn(address indexed to, uint256 amount, uint256 balance);
    event RandomnessRequested(
        bytes32 indexed requestId,
        bytes32 indexed coordinatorRequestId,
        uint256 requestFee
    );
    event RandomnessFulfilled(
        bytes32 indexed requestId,
        bytes32 indexed coordinatorRequestId,
        uint256 randomness
    );

    IRandomnessCoordinator public immutable coordinator;
    bytes32 public immutable coordinatorCodeHash;
    uint256 public immutable maxRequestFee;

    mapping(bytes32 requestId => Result result) private _results;
    mapping(bytes32 requestId => bytes32 coordinatorRequestId) public coordinatorRequestByClientRequest;
    mapping(bytes32 coordinatorRequestId => bytes32 requestId) public clientRequestByCoordinatorRequest;

    constructor(address coordinator_, bytes32 expectedCoordinatorCodeHash_, uint256 maxRequestFee_) {
        if (coordinator_ == address(0)) revert InvalidAddress();
        if (coordinator_.code.length == 0) revert CoordinatorHasNoCode(coordinator_);
        bytes32 actualCodeHash = coordinator_.codehash;
        if (expectedCoordinatorCodeHash_ == bytes32(0) || actualCodeHash != expectedCoordinatorCodeHash_) {
            revert InvalidCoordinatorCodeHash(expectedCoordinatorCodeHash_, actualCodeHash);
        }

        coordinator = IRandomnessCoordinator(coordinator_);
        coordinatorCodeHash = actualCodeHash;
        maxRequestFee = maxRequestFee_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FUND_ADMIN_ROLE, msg.sender);
    }

    receive() external payable {
        emit RequestFundingReceived(msg.sender, msg.value, address(this).balance);
    }

    function requestRandomness(bytes32 requestId) external onlyRole(REQUESTER_ROLE) nonReentrant {
        if (requestId == bytes32(0)) revert ZeroRequestId();
        if (_results[requestId].exists) revert RandomnessRequestAlreadyExists(requestId);

        uint256 fee = coordinator.requestFee();
        if (fee > maxRequestFee) revert RequestFeeExceedsCap(fee, maxRequestFee);
        if (address(this).balance < fee) {
            revert InsufficientRequestFunding(fee, address(this).balance);
        }

        _results[requestId].exists = true;
        bytes32 coordinatorRequestId = coordinator.requestRandomness{value: fee}(requestId);
        if (coordinatorRequestId == bytes32(0)) revert InvalidCoordinatorRequestId();
        if (clientRequestByCoordinatorRequest[coordinatorRequestId] != bytes32(0)) {
            revert CoordinatorRequestAlreadyMapped(coordinatorRequestId);
        }

        coordinatorRequestByClientRequest[requestId] = coordinatorRequestId;
        clientRequestByCoordinatorRequest[coordinatorRequestId] = requestId;
        emit RandomnessRequested(requestId, coordinatorRequestId, fee);
    }

    function fulfillRandomness(bytes32 coordinatorRequestId, uint256 randomness) external {
        if (msg.sender != address(coordinator)) revert UnauthorizedCoordinator(msg.sender);
        bytes32 requestId = clientRequestByCoordinatorRequest[coordinatorRequestId];
        if (requestId == bytes32(0)) revert UnknownCoordinatorRequest(coordinatorRequestId);
        if (randomness == 0) revert ZeroRandomness(coordinatorRequestId);

        Result storage result = _results[requestId];
        if (result.ready) revert RandomnessAlreadyFulfilled(requestId);
        result.randomness = randomness;
        result.ready = true;
        emit RandomnessFulfilled(requestId, coordinatorRequestId, randomness);
    }

    function readRandomness(bytes32 requestId) external view returns (bool ready, uint256 randomness) {
        Result memory result = _results[requestId];
        return (result.ready, result.randomness);
    }

    function withdrawRequestFunding(address payable to, uint256 amount)
        external
        onlyRole(FUND_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0) || amount == 0 || amount > address(this).balance) {
            revert InvalidWithdrawal(to, amount);
        }
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert FundingTransferFailed(to, amount);
        emit RequestFundingWithdrawn(to, amount, address(this).balance);
    }
}
