// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract WoodcuttingFacet {
    // Item IDs
    uint256 constant BRONZE_AXE = 101;
    uint256 constant IRON_AXE = 102;
    
    uint256 constant OAK_LOG = 201;
    uint256 constant WILLOW_LOG = 202;
    
    uint256 constant WOODCUTTING_CHARM = 402;

    event Chopped(address indexed tba, uint256 logId, uint256 amount, uint256 xpGained);

    // Square Root Helper
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

    function chopOak(uint256 tokenId) external {
        _chop(tokenId, OAK_LOG);
    }

    function chopWillow(uint256 tokenId) external {
        _chop(tokenId, WILLOW_LOG);
    }

    function _chop(uint256 tokenId, uint256 logId) internal {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);

        // Check Tools
        uint256 bronzeAxe = gs.items.balanceOf(tba, BRONZE_AXE);
        uint256 ironAxe = gs.items.balanceOf(tba, IRON_AXE);
        uint256 hasCharm = gs.items.balanceOf(tba, WOODCUTTING_CHARM);
        require(bronzeAxe > 0 || ironAxe > 0, "No axe equipped");

        if (logId == WILLOW_LOG) {
            require(ironAxe > 0, "Iron Axe required for Willow");
        }

        // CALCULATE LEVEL
        uint256 currentXp = gs.xp[tokenId][2];
        uint256 level = getLevel(currentXp);

        uint256 amount = 1;
        uint256 xp = 10; // Base XP for Oak

        // XP & Yield Logic
        if (logId == OAK_LOG) {
            if (ironAxe > 0) {
                amount = 10;
                xp = 100; // 10 * 10xp
            }
        } else if (logId == WILLOW_LOG) {
            xp = 25; // Base for Willow
            // if (ironAxe > 0) { ... }
        }

        // APPLY CHARM MULTIPLIER
        // Stacking Multiplier: Base * (1 + charmCount)
        if (hasCharm > 0) {
            amount = amount * (1 + hasCharm);
            xp = xp * (1 + hasCharm);
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
