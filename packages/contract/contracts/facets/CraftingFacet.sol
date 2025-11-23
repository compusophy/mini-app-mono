// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract CraftingFacet {
    // Resources
    uint256 constant OAK_LOG = 201;
    uint256 constant IRON_ORE = 301;
    uint256 constant COAL_ORE = 302;
    
    // Intermediate
    uint256 constant IRON_BAR = 401;
    uint256 constant STEEL_BAR = 402;

    // Tools
    uint256 constant IRON_AXE = 102;
    uint256 constant IRON_PICKAXE = 152;

    event Crafted(address indexed tba, uint256 itemId, uint256 amount);

    // Smelt Iron Ore -> Iron Bar (1:1)
    function smeltIron(uint256 tokenId, uint256 amount) external {
        _craft(tokenId, IRON_BAR, amount);
    }

    // Smelt Iron Ore + Coal -> Steel Bar (1 Iron + 2 Coal -> 1 Steel)
    function smeltSteel(uint256 tokenId, uint256 amount) external {
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
    function craftIronAxe(uint256 tokenId) external {
        _craftTool(tokenId, IRON_AXE);
    }

    function craftIronPickaxe(uint256 tokenId) external {
        _craftTool(tokenId, IRON_PICKAXE);
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

        // Mint Result
        gs.items.mint(tba, resultItem, 1, "");
        emit Crafted(tba, resultItem, 1);
    }

    function _craft(uint256 tokenId, uint256 resultItem, uint256 amount) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        address tba = LibGame.getTBA(tokenId);

        if (resultItem == IRON_BAR) {
            // 1 Iron Ore -> 1 Iron Bar
            require(gs.items.balanceOf(tba, IRON_ORE) >= amount, "Not enough Iron Ore");
            gs.items.burn(tba, IRON_ORE, amount);
            gs.items.mint(tba, IRON_BAR, amount, "");
        } 
        else if (resultItem == STEEL_BAR) {
            // 1 Iron Bar + 2 Coal -> 1 Steel Bar (Let's require Bars for Steel, or Ore? simpler: Ore)
            // Let's say: 1 Iron Ore + 2 Coal -> 1 Steel Bar for now to match ore-focus.
            // Actually, standard is usually Bar + Coal. Let's require Iron Bars if we have them.
            // But we haven't enforced making Iron Bars for Axes.
            // Let's assume: 1 Iron Ore + 2 Coal -> 1 Steel Bar (Simplest flow)
            require(gs.items.balanceOf(tba, IRON_ORE) >= amount, "Not enough Iron Ore");
            require(gs.items.balanceOf(tba, COAL_ORE) >= amount * 2, "Not enough Coal");
            
            gs.items.burn(tba, IRON_ORE, amount);
            gs.items.burn(tba, COAL_ORE, amount * 2);
            gs.items.mint(tba, STEEL_BAR, amount, "");
        }

        emit Crafted(tba, resultItem, amount);
    }
}

