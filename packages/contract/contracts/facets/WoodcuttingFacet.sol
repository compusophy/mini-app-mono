// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract WoodcuttingFacet {
    // Item IDs
    uint256 constant BRONZE_AXE = 101;
    uint256 constant IRON_AXE = 102;
    uint256 constant STEEL_AXE = 103;
    
    uint256 constant OAK_LOG = 201;
    uint256 constant WILLOW_LOG = 202;
    uint256 constant MAPLE_LOG = 203;
    
    uint256 constant WOODCUTTING_CHARM = 402;

    event Chopped(address indexed tba, uint256 logId, uint256 amount, uint256 xpGained);

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

    function chopOak(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _chop(tokenId, OAK_LOG);
    }

    function chopWillow(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _chop(tokenId, WILLOW_LOG);
    }

    function chopMaple(uint256 tokenId, uint256 version) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(version >= gs.minGameVersion, "Client Version Outdated - Please Refresh");
        _chop(tokenId, MAPLE_LOG);
    }

    function _chop(uint256 tokenId, uint256 logId) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);

        // Check Tools
        uint256 bronzeAxe = gs.items.balanceOf(tba, BRONZE_AXE);
        uint256 ironAxe = gs.items.balanceOf(tba, IRON_AXE);
        uint256 steelAxe = gs.items.balanceOf(tba, STEEL_AXE);
        uint256 hasCharm = gs.items.balanceOf(tba, WOODCUTTING_CHARM);
        require(bronzeAxe > 0 || ironAxe > 0 || steelAxe > 0, "No axe equipped");

        if (logId == WILLOW_LOG) {
            require(ironAxe > 0 || steelAxe > 0, "Iron Axe required for Willow");
        } else if (logId == MAPLE_LOG) {
            require(ironAxe > 0 || steelAxe > 0, "Iron Axe required for Maple");
        }

        // CALCULATE LEVEL
        uint256 currentXp = gs.xp[tokenId][2];
        uint256 level = getLevel(currentXp);

        if (logId == MAPLE_LOG) {
            require(ironAxe >= 100, "Not enough Iron Axes");
            gs.items.burn(tba, IRON_AXE, 100);
        }

        uint256 amount = 1;
        uint256 xp = 10; // Base XP for Oak

        // XP & Yield Logic
        if (logId == OAK_LOG) {
            if (steelAxe > 0) {
                amount = 100;
                xp = 1000;
            } else if (ironAxe > 0) {
                amount = 10;
                xp = 100; 
            }
        } else if (logId == WILLOW_LOG) {
            xp = 25; 
        } else if (logId == MAPLE_LOG) {
            xp = 50;
            if (steelAxe > 0) {
                amount = 10;
                xp = 500;
            }
        }

        // APPLY CHARM MULTIPLIER (Fixed 2x)
        if (hasCharm > 0) {
            amount = amount * 2;
            xp = xp * 2;
        }

        // APPLY LEVEL MULTIPLIER
        amount = amount * level;
        xp = xp * level;

        // Cap XP gain at Level 200
        if (level >= 200) {
            xp = 0;
        }

        // Update XP
        gs.xp[tokenId][2] += xp; // Skill 2 = Woodcutting

        // Mint Logs
        gs.items.mint(tba, logId, amount, "");
        
        emit Chopped(tba, logId, amount, xp);
    }
}
