// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract MiningFacet {
    // Item IDs
    uint256 constant BRONZE_PICKAXE = 151;
    uint256 constant IRON_PICKAXE = 152;
    uint256 constant STEEL_PICKAXE = 153;
    
    uint256 constant IRON_ORE = 301; // Was Copper/Iron
    uint256 constant COAL_ORE = 302; 
    
    uint256 constant MINING_CHARM = 401;

    event Mined(address indexed tba, uint256 oreId, uint256 amount, uint256 xpGained);

    // Helpers
    function cbrt(uint256 n) internal pure returns (uint256) {
        uint256 x = 0;
        uint256 y = 0;
        uint256 z = 0;
        
        if (n == 0) {
            return 0;
        }
        
        x = n;
        y = 1;
        
        while (x >= 2) {
            x = x / 8; 
            y = y * 2;
        }
        
        z = y;
        for (uint256 i = 0; i < 10; i++) {
            z = (2 * z + n / (z * z)) / 3;
        }
        return z;
    }

    // Level Calculator
    function getLevel(uint256 xp) internal pure returns (uint256) {
        uint256 level = cbrt(xp / 20) + 1;
        
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
        uint256 steelPick = gs.items.balanceOf(tba, STEEL_PICKAXE);
        uint256 hasCharm = gs.items.balanceOf(tba, MINING_CHARM);
        require(bronzePick > 0 || ironPick > 0 || steelPick > 0, "No pickaxe equipped");

        if (oreId == COAL_ORE) {
            require(ironPick > 0 || steelPick > 0, "Iron Pickaxe required for Coal");
        }

        // CALCULATE LEVEL
        uint256 currentXp = gs.xp[tokenId][1];
        uint256 level = getLevel(currentXp);

        if (oreId == COAL_ORE) {
            require(ironPick >= 100, "Not enough Iron Pickaxes");
            gs.items.burn(tba, IRON_PICKAXE, 100);
        }

        uint256 amount = 1;
        uint256 xp = 10; // Base XP

        if (oreId == IRON_ORE) {
            if (steelPick > 0) {
                amount = 100;
                xp = 1000;
            } else if (ironPick > 0) {
                amount = 10;
                xp = 100;
            }
        } else if (oreId == COAL_ORE) {
            xp = 25;
            if (steelPick > 0) {
                amount = 10;
                xp = 250;
            }
        }

        // APPLY CHARM MULTIPLIER (Fixed 2x)
        if (hasCharm > 0) {
            amount = amount * 2;
            xp = xp * 2;
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
