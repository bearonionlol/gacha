// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ICoordinatorRandomnessReceiver {
    function fulfillRandomness(bytes32 coordinatorRequestId, uint256 randomness) external;
}

contract MockRandomnessCoordinator {
    uint256 public requestFee;
    uint256 public nextRequestNumber = 1;
    bool public returnZeroRequestId;

    mapping(bytes32 coordinatorRequestId => address requester) public requesterById;
    mapping(bytes32 coordinatorRequestId => bytes32 clientRequestId) public clientRequestById;

    constructor(uint256 requestFee_) {
        requestFee = requestFee_;
    }

    function setRequestFee(uint256 requestFee_) external {
        requestFee = requestFee_;
    }

    function setReturnZeroRequestId(bool enabled) external {
        returnZeroRequestId = enabled;
    }

    function requestRandomness(bytes32 clientRequestId) external payable returns (bytes32 coordinatorRequestId) {
        require(msg.value == requestFee, "fee");
        if (returnZeroRequestId) return bytes32(0);
        coordinatorRequestId = keccak256(abi.encode(address(this), msg.sender, clientRequestId, nextRequestNumber++));
        requesterById[coordinatorRequestId] = msg.sender;
        clientRequestById[coordinatorRequestId] = clientRequestId;
    }

    function fulfill(bytes32 coordinatorRequestId, uint256 randomness) external {
        ICoordinatorRandomnessReceiver(requesterById[coordinatorRequestId]).fulfillRandomness(
            coordinatorRequestId,
            randomness
        );
    }

    function fulfillTo(address receiver, bytes32 coordinatorRequestId, uint256 randomness) external {
        ICoordinatorRandomnessReceiver(receiver).fulfillRandomness(coordinatorRequestId, randomness);
    }
}
