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
    
    // Intermediate
    uint256 constant IRON_BAR = 401;
    uint256 constant STEEL_BAR = 402;

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

    // Smelt Iron Ore -> Iron Bar (1:1)
    function smeltIron(uint256 tokenId, uint256 amount, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craft(tokenId, IRON_BAR, amount);
    }

    // Smelt Iron Ore + Coal -> Steel Bar (1 Iron + 2 Coal -> 1 Steel)
    function smeltSteel(uint256 tokenId, uint256 amount, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _craft(tokenId, STEEL_BAR, amount);
    }

    // Craft Iron Axe (100 Iron Bars + 100 Oak Logs)
    // UPDATED: Per user request "100 iron ore and 100 oak logs", but logically
    // usually we smelt first. User said "cost 100 iron ore and 100 oak logs".
    // We can implement direct crafting or require bars.
    // Let's stick to user's "100 Iron Ore + 100 Oak Logs" for simplicity unless specified.
    // Wait, user later said "make smithing then... craft iron axes... make steel bars".
    // This implies a Smithing step. 
    // Let's implement: 100 Iron Ore + 100 Oak Logs -> Iron Axe (Direct, matching first request)
    // AND allow smelting for future steel items.
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

    function _craft(uint256 tokenId, uint256 resultItem, uint256 amount) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        address tba = LibGame.getTBA(tokenId);

        // Calculate Logic
        uint256 currentXp = gs.xp[tokenId][SKILL_CRAFTING];
        uint256 level = getLevel(currentXp);
        
        // Calculate total cost based on input amount
        // Note: amount here is "how many times to craft" or "how many output items"?
        // Usage in smeltIron(amount): "amount" usually means number of operations.
        // BUT, if we apply level multiplier, the user requests "1 craft", pays for "1 craft", and gets "1 * Level" items.
        // If user calls smeltIron(10), they pay for 10, and get 10 * Level.
        
        uint256 outputAmount = amount * level;
        uint256 xpGained = 10 * amount * level; // 10 XP per base craft

        if (level >= 200) xpGained = 0;

        if (resultItem == IRON_BAR) {
            // 1 Iron Ore -> 1 Iron Bar
            require(gs.items.balanceOf(tba, IRON_ORE) >= amount, "Not enough Iron Ore");
            gs.items.burn(tba, IRON_ORE, amount);
            gs.items.mint(tba, IRON_BAR, outputAmount, "");
        } 
        else if (resultItem == STEEL_BAR) {
            // 1 Iron Ore + 2 Coal -> 1 Steel Bar
            require(gs.items.balanceOf(tba, IRON_ORE) >= amount, "Not enough Iron Ore");
            require(gs.items.balanceOf(tba, COAL_ORE) >= amount * 2, "Not enough Coal");
            
            gs.items.burn(tba, IRON_ORE, amount);
            gs.items.burn(tba, COAL_ORE, amount * 2);
            gs.items.mint(tba, STEEL_BAR, outputAmount, "");
        }
        
        gs.xp[tokenId][SKILL_CRAFTING] += xpGained;

        emit Crafted(tba, resultItem, outputAmount, xpGained);
    }
}

