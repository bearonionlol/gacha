// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC1155ApprovalTarget {
    function setApprovalForAll(address operator, bool approved) external;
}

interface IForgeCraftTarget {
    function craft(uint256 recipeId) external payable returns (uint256 outputTokenId);
}

contract NonERC1155ForgeCrafter {
    function approveItemOperator(IERC1155ApprovalTarget itemToken, address operator) external {
        itemToken.setApprovalForAll(operator, true);
    }

    function craft(IForgeCraftTarget forge, uint256 recipeId) external payable returns (uint256 outputTokenId) {
        return forge.craft{value: msg.value}(recipeId);
    }
}
