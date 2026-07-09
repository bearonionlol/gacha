// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IRandomnessProvider {
    function requestRandomness(bytes32 requestId) external;

    function readRandomness(bytes32 requestId) external view returns (bool ready, uint256 randomness);
}
