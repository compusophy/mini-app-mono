// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract CraftingFacet {
    // Resources
    uint256 constant OAK_LOG = 201;
    uint256 constant MAPLE_LOG = 203;
    uint256 constant IRON_ORE = 301;
    uint256 constant COAL_ORE = 302;
    
    // Tools
    uint256 constant IRON_AXE = 102;
    uint256 constant STEEL_AXE = 103;
    uint256 constant IRON_PICKAXE = 152;
    uint256 constant STEEL_PICKAXE = 153;

    uint256 constant SKILL_CRAFTING = 3;

    event Crafted(address indexed tba, uint256 itemId, uint256 amount, uint256 xpGained);

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

    function getLevel(uint256 xp) internal pure returns (uint256) {
        uint256 level = cbrt(xp / 20) + 1;
        if (level > 200) return 200;
        return level;
    }

    // Craft Iron Axe (100 Iron Ore + 100 Oak Logs)
    function craftIronAxe(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craftTool(tokenId, IRON_AXE);
    }

    function craftIronPickaxe(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craftTool(tokenId, IRON_PICKAXE);
    }

    function craftSteelAxe(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craftSteelTool(tokenId, STEEL_AXE);
    }

    function craftSteelPickaxe(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craftSteelTool(tokenId, STEEL_PICKAXE);
    }

    function _craftSteelTool(uint256 tokenId, uint256 resultItem) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        address tba = LibGame.getTBA(tokenId);

        // Recipe: 100 Coal + 100 Maple
        uint256 coalCost = 100;
        uint256 mapleCost = 100;

        require(gs.items.balanceOf(tba, COAL_ORE) >= coalCost, "Not enough Coal");
        require(gs.items.balanceOf(tba, MAPLE_LOG) >= mapleCost, "Not enough Maple Logs");

        gs.items.burn(tba, COAL_ORE, coalCost);
        gs.items.burn(tba, MAPLE_LOG, mapleCost);

        // Fixed 1 Yield, Fixed 50 XP
        uint256 amount = 1;
        uint256 xp = 50;

        gs.xp[tokenId][SKILL_CRAFTING] += xp;
        gs.items.mint(tba, resultItem, amount, "");
        emit Crafted(tba, resultItem, amount, xp);
    }

    function _craftTool(uint256 tokenId, uint256 resultItem) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        address tba = LibGame.getTBA(tokenId);

        // Recipe: 100 Iron Ore + 100 Oak Logs
        uint256 oreCost = 100;
        uint256 logCost = 100;

        require(gs.items.balanceOf(tba, IRON_ORE) >= oreCost, "Not enough Iron Ore");
        require(gs.items.balanceOf(tba, OAK_LOG) >= logCost, "Not enough Oak Logs");

        // Burn ingredients
        gs.items.burn(tba, IRON_ORE, oreCost);
        gs.items.burn(tba, OAK_LOG, logCost);

        // Calculate Logic
        uint256 currentXp = gs.xp[tokenId][SKILL_CRAFTING];
        uint256 level = getLevel(currentXp);
        
        uint256 amount = 1 * level;
        uint256 xp = 10 * level; // Base 10 XP

        if (level >= 200) xp = 0;
        
        // Update XP
        gs.xp[tokenId][SKILL_CRAFTING] += xp;

        // Mint Result
        gs.items.mint(tba, resultItem, amount, "");
        emit Crafted(tba, resultItem, amount, xp);
    }
}
