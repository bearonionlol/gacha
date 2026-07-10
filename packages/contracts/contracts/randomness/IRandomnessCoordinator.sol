// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IRandomnessCoordinator {
    function requestFee() external view returns (uint256);

    function requestRandomness(bytes32 clientRequestId) external payable returns (bytes32 coordinatorRequestId);
}
