// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";

contract StatsFacet {
    
    // Helper to get square root (from other facets)
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

    function getLevel(uint256 xp) internal pure returns (uint256) {
        uint256 level = sqrt(xp / 100) + 1;
        if (level > 100) {
            return 100;
        }
        return level;
    }

    function getXP(uint256 tokenId, uint256 skillId) external view returns (uint256) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        return gs.xp[tokenId][skillId];
    }

    function getLevelForSkill(uint256 tokenId, uint256 skillId) external view returns (uint256) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        return getLevel(gs.xp[tokenId][skillId]);
    }
    
    // Batch reader for efficiency
    function getStats(uint256 tokenId) external view returns (uint256 miningXp, uint256 miningLevel, uint256 woodcuttingXp, uint256 woodcuttingLevel) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        miningXp = gs.xp[tokenId][1];
        miningLevel = getLevel(miningXp);
        woodcuttingXp = gs.xp[tokenId][2];
        woodcuttingLevel = getLevel(woodcuttingXp);
    }
}

