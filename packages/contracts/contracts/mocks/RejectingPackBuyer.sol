// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPackSaleBuyerTarget {
    function purchase(uint256 dropId) external payable returns (uint256 purchaseId);
    function claimRevealedTokenTo(uint256 purchaseId, address to) external;
    function withdrawRefund() external;
}

contract RejectingPackBuyer {
    error NativeRejected();

    function purchasePack(IPackSaleBuyerTarget packSale, uint256 dropId) external payable returns (uint256 purchaseId) {
        return packSale.purchase{value: msg.value}(dropId);
    }

    function claimRevealedTokenTo(IPackSaleBuyerTarget packSale, uint256 purchaseId, address to) external {
        packSale.claimRevealedTokenTo(purchaseId, to);
    }

    function withdrawRefund(IPackSaleBuyerTarget packSale) external {
        packSale.withdrawRefund();
    }

    receive() external payable {
        revert NativeRejected();
    }

    fallback() external payable {
        revert NativeRejected();
    }
}
