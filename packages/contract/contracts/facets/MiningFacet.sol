// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract MiningFacet {
    // Item IDs
    uint256 constant BRONZE_PICKAXE = 151;
    uint256 constant IRON_PICKAXE = 152;
    
    uint256 constant IRON_ORE = 301; // Was Copper/Iron
    uint256 constant COAL_ORE = 302; 

    event Mined(address indexed tba, uint256 oreId, uint256 amount, uint256 xpGained);

    function mineIron(uint256 tokenId) external {
        _mine(tokenId, IRON_ORE);
    }

    function mineCoal(uint256 tokenId) external {
        _mine(tokenId, COAL_ORE);
    }

    function _mine(uint256 tokenId, uint256 oreId) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);

        // Check Tools
        uint256 bronzePick = gs.items.balanceOf(tba, BRONZE_PICKAXE);
        uint256 ironPick = gs.items.balanceOf(tba, IRON_PICKAXE);
        require(bronzePick > 0 || ironPick > 0, "No pickaxe equipped");

        if (oreId == COAL_ORE) {
            require(ironPick > 0, "Iron Pickaxe required for Coal");
        }

        uint256 amount = 1;
        uint256 xp = 10; // Base XP

        if (oreId == IRON_ORE) {
            if (ironPick > 0) {
                amount = 10;
                xp = 100;
            }
        } else if (oreId == COAL_ORE) {
            xp = 25;
        }

        // Update XP
        gs.xp[tokenId][1] += xp; // Skill 1 = Mining

        // Mint Ore
        gs.items.mint(tba, oreId, amount, "");
        
        emit Mined(tba, oreId, amount, xp);
    }
}
