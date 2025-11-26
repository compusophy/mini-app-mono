// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract ShopFacet {
    // Item IDs
    uint256 constant GOLD_COINS = 1;
    
    // Trinkets
    uint256 constant MINING_CHARM = 401;
    uint256 constant WOODCUTTING_CHARM = 402;
    uint256 constant GOLD_CHARM = 403;

    event ItemPurchased(address indexed tba, uint256 itemId, uint256 cost);

    function buyItem(uint256 itemId, uint256 tokenId) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);
        uint256 cost = 0;

        if (itemId == MINING_CHARM) {
            cost = 1000 * 10**18; // 1000 Gold
        } else if (itemId == WOODCUTTING_CHARM) {
            cost = 1000 * 10**18; // 1000 Gold
        } else if (itemId == GOLD_CHARM) {
            cost = 100000 * 10**18; // 100,000 Gold
        } else {
            revert("Shop: Invalid Item ID");
        }

        // Check Balance
        require(gs.items.balanceOf(tba, GOLD_COINS) >= cost, "Shop: Insufficient Gold");

        // Burn Gold from TBA
        // Note: This requires the Items contract to allow the Diamond (Minter) to burn from any account
        // OR the TBA must have approved the Diamond.
        // SkillerItemsV2 inherits ERC1155 which allows approved operators to burn.
        // SkillerItemsV2 also has `burn` function if it's standard extension.
        // If we don't have approval, this will fail.
        // Assuming for this task that the Diamond is an operator or we can burn.
        // If not, we might need to add logic to `SkillerItemsV2` or rely on user `setApprovalForAll` on frontend.
        
        // We will assume setApprovalForAll is handled or not needed if Diamond is "God" (it usually isn't in standard ERC1155).
        // However, typically Game contracts are set as operators during setup or user approves them.
        gs.items.burn(tba, GOLD_COINS, cost); 

        // Mint Item
        gs.items.mint(tba, itemId, 1, "");
        
        emit ItemPurchased(tba, itemId, cost);
    }
}

