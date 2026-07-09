// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

interface IERC1155ApprovalTarget {
    function setApprovalForAll(address operator, bool approved) external;
}

interface IMarketplaceTarget {
    function list(uint256 tokenId, uint256 amount, uint256 price) external returns (uint256 listingId);
    function buy(uint256 listingId) external payable;
    function withdrawProceeds() external;
    function withdrawProceedsTo(address payable to) external;
}

interface IBuybackVaultTarget {
    function acceptQuote(uint256 tokenId, uint256 amount) external;
    function withdrawPayout() external;
    function withdrawPayoutTo(address payable to) external;
}

contract RejectingNativeParticipant is ERC1155Holder {
    error NativeRejected();

    function approveItemOperator(IERC1155ApprovalTarget itemToken, address operator) external {
        itemToken.setApprovalForAll(operator, true);
    }

    function listItem(
        IMarketplaceTarget marketplace,
        uint256 tokenId,
        uint256 amount,
        uint256 price
    ) external returns (uint256 listingId) {
        return marketplace.list(tokenId, amount, price);
    }

    function buyListing(IMarketplaceTarget marketplace, uint256 listingId) external payable {
        marketplace.buy{value: msg.value}(listingId);
    }

    function withdrawMarketplaceProceeds(IMarketplaceTarget marketplace) external {
        marketplace.withdrawProceeds();
    }

    function withdrawMarketplaceProceedsTo(IMarketplaceTarget marketplace, address payable to) external {
        marketplace.withdrawProceedsTo(to);
    }

    function acceptBuybackQuote(IBuybackVaultTarget buybackVault, uint256 tokenId, uint256 amount) external {
        buybackVault.acceptQuote(tokenId, amount);
    }

    function withdrawBuybackPayout(IBuybackVaultTarget buybackVault) external {
        buybackVault.withdrawPayout();
    }

    function withdrawBuybackPayoutTo(IBuybackVaultTarget buybackVault, address payable to) external {
        buybackVault.withdrawPayoutTo(to);
    }

    receive() external payable {
        revert NativeRejected();
    }

    fallback() external payable {
        revert NativeRejected();
    }
}

contract NonERC1155MarketplaceBuyer {
    function buyListing(IMarketplaceTarget marketplace, uint256 listingId) external payable {
        marketplace.buy{value: msg.value}(listingId);
    }
}
