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
    
    uint256 constant MINING_CHARM = 401;

    event Mined(address indexed tba, uint256 oreId, uint256 amount, uint256 xpGained);

    // Helpers
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // Level Calculator
    function getLevel(uint256 xp) internal pure returns (uint256) {
        uint256 LEVEL_100_XP = 980100; // 100 * (100-1)^2

        if (xp <= LEVEL_100_XP) {
            return sqrt(xp / 100) + 1;
        }

        // For levels > 100, the xp requirement gap is 100x larger.
        // Normalized XP = 980100 + (xp - 980100) / 100
        uint256 normalizedXp = LEVEL_100_XP + (xp - LEVEL_100_XP) / 100;
        uint256 level = sqrt(normalizedXp / 100) + 1;

        if (level > 200) {
            return 200;
        }
        return level;
    }

    function mineIron(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _mine(tokenId, IRON_ORE);
    }

    function mineCoal(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _mine(tokenId, COAL_ORE);
    }

    function _mine(uint256 tokenId, uint256 oreId) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);

        // Check Tools
        uint256 bronzePick = gs.items.balanceOf(tba, BRONZE_PICKAXE);
        uint256 ironPick = gs.items.balanceOf(tba, IRON_PICKAXE);
        uint256 hasCharm = gs.items.balanceOf(tba, MINING_CHARM);
        require(bronzePick > 0 || ironPick > 0, "No pickaxe equipped");

        if (oreId == COAL_ORE) {
            require(ironPick > 0, "Iron Pickaxe required for Coal");
        }

        // CALCULATE LEVEL
        uint256 currentXp = gs.xp[tokenId][1];
        uint256 level = getLevel(currentXp);

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

        // APPLY CHARM MULTIPLIER
        // Stacking Multiplier: Base * (1 + charmCount)
        if (hasCharm > 0) {
            amount = amount * (1 + hasCharm);
            xp = xp * (1 + hasCharm);
        }

        // APPLY MULTIPLIER
        amount = amount * level;
        xp = xp * level;

        // Cap XP gain at Level 200
        if (level >= 200) {
            xp = 0;
        }

        // Update XP
        gs.xp[tokenId][1] += xp; // Skill 1 = Mining

        // Mint Ore
        gs.items.mint(tba, oreId, amount, "");
        
        emit Mined(tba, oreId, amount, xp);
    }
}
