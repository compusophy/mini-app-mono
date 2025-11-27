// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";

contract StatsFacet {
    
    // Helper to get cube root
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
            x = x / 8; // 2^3
            y = y * 2;
        }
        
        // y is roughly cbrt(n) but lower bound power of 2
        // Newton-Raphson iteration
        // x_{k+1} = (2*x_k + n/x_k^2) / 3
        
        // Initial guess
        z = y;
        
        // 7 iterations is enough for uint256
        for (uint256 i = 0; i < 10; i++) {
            z = (2 * z + n / (z * z)) / 3;
        }
        
        return z;
    }

    function getLevel(uint256 xp) internal pure returns (uint256) {
        // Cubic Scaling: Level = cbrt(xp / 20) + 1
        // Max Level Cap: 200
        
        uint256 level = cbrt(xp / 20) + 1;
        
        if (level > 200) {
            return 200;
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
    function getStats(uint256 tokenId) external view returns (
        uint256 miningXp, 
        uint256 miningLevel, 
        uint256 woodcuttingXp, 
        uint256 woodcuttingLevel,
        uint256 craftingXp,
        uint256 craftingLevel
    ) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        miningXp = gs.xp[tokenId][1];
        miningLevel = getLevel(miningXp);
        woodcuttingXp = gs.xp[tokenId][2];
        woodcuttingLevel = getLevel(woodcuttingXp);
        craftingXp = gs.xp[tokenId][3];
        craftingLevel = getLevel(craftingXp);
    }
}

