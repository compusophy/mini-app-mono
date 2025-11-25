// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibVoid.sol";
import "../libraries/LibDiamond.sol";

contract VoidFacet {
    uint256 constant OAK_LOG = 201;
    uint256 constant IRON_ORE = 301;
    
    // Skill ID 99 = Void Level
    uint256 constant VOID_SKILL_ID = 99;

    event VoidSacrifice(address indexed tba, uint256 tokenId, uint256 newLevel, uint256 cost);

    // View: Get current cost for next level
    function getVoidCost(uint256 tokenId) external view returns (uint256) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        uint256 nextLevel = gs.xp[tokenId][VOID_SKILL_ID] + 1;
        return 100 * (nextLevel * nextLevel);
    }

    // View: Get Void Level
    function getVoidLevel(uint256 tokenId) external view returns (uint256) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        return gs.xp[tokenId][VOID_SKILL_ID];
    }

    // Action: Sacrifice resources
    function sacrificeToVoid(uint256 tokenId) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not profile owner");
        
        address tba = LibGame.getTBA(tokenId);

        // 1. Calculate Cost
        uint256 currentLevel = gs.xp[tokenId][VOID_SKILL_ID];
        uint256 nextLevel = currentLevel + 1;
        uint256 cost = 100 * (nextLevel * nextLevel);

        // 2. Check Balance & Burn BOTH
        require(gs.items.balanceOf(tba, OAK_LOG) >= cost, "The Void demands more Logs.");
        require(gs.items.balanceOf(tba, IRON_ORE) >= cost, "The Void demands more Ore.");
        
        gs.items.burn(tba, OAK_LOG, cost);
        gs.items.burn(tba, IRON_ORE, cost);

        // 3. Update State
        gs.xp[tokenId][VOID_SKILL_ID] = nextLevel;

        // 4. Update Leaderboard
        _updateLeaderboard(tokenId, nextLevel);

        emit VoidSacrifice(tba, tokenId, nextLevel, cost);
    }

    function _updateLeaderboard(uint256 tokenId, uint256 newLevel) internal {
        LibVoid.VoidStorage storage vs = LibVoid.voidStorage();
        
        // 1. Check if eligible (Board not full OR newLevel > minScore)
        // If board is full (entry 99 has level > 0) and we are <= minScore, we can't enter.
        if (vs.leaderboard[99].level > 0 && newLevel <= vs.leaderboard[99].level) {
            // But wait, if we are ALREADY on the board, we need to update our position!
            // We must scan to find ourselves regardless, or optimize.
            // Let's scan first.
        }

        // Find existing index
        uint256 existingIndex = 999;
        for (uint256 i = 0; i < 100; i++) {
            if (vs.leaderboard[i].tokenId == tokenId) {
                existingIndex = i;
                break;
            }
        }

        // If we are not on board, and score is too low, exit
        if (existingIndex == 999 && vs.leaderboard[99].level > 0 && newLevel <= vs.leaderboard[99].level) {
            return;
        }

        // If existing, update level
        if (existingIndex != 999) {
            vs.leaderboard[existingIndex].level = newLevel;
            // Bubble up
            for (uint256 i = existingIndex; i > 0; i--) {
                if (vs.leaderboard[i].level > vs.leaderboard[i-1].level) {
                    // Swap
                    LibVoid.LeaderboardEntry memory temp = vs.leaderboard[i-1];
                    vs.leaderboard[i-1] = vs.leaderboard[i];
                    vs.leaderboard[i] = temp;
                } else {
                    break;
                }
            }
        } else {
            // New entry, insert at correct position
            // Find insertion point
            uint256 insertAt = 999;
            for (uint256 i = 0; i < 100; i++) {
                if (newLevel > vs.leaderboard[i].level) {
                    insertAt = i;
                    break;
                }
                // If slot is empty (level 0), take it
                if (vs.leaderboard[i].level == 0) {
                    insertAt = i;
                    break;
                }
            }

            if (insertAt != 999) {
                // Shift Right from insertAt to 98 (99 drops off)
                for (uint256 i = 99; i > insertAt; i--) {
                    vs.leaderboard[i] = vs.leaderboard[i-1];
                }
                // Insert
                vs.leaderboard[insertAt] = LibVoid.LeaderboardEntry(tokenId, newLevel);
            }
        }
    }

    function getLeaderboard() external view returns (LibVoid.LeaderboardEntry[] memory) {
        LibVoid.VoidStorage storage vs = LibVoid.voidStorage();
        LibVoid.LeaderboardEntry[] memory board = new LibVoid.LeaderboardEntry[](100);
        for (uint256 i = 0; i < 100; i++) {
            board[i] = vs.leaderboard[i];
        }
        return board;
    }

    function resetLeaderboard() external {
        LibDiamond.enforceIsContractOwner();
        LibVoid.VoidStorage storage vs = LibVoid.voidStorage();
        // Manual wipe to ensure all slots are cleared (delete vs.leaderboard might just reset length but keep data if not dynamic?)
        // Actually for fixed array delete clears it. But let's be explicit.
        for (uint256 i = 0; i < 100; i++) {
            vs.leaderboard[i] = LibVoid.LeaderboardEntry(0, 0);
        }
        vs.minScore = 0;
    }

    function resetVoidLevel(uint256 tokenId) external {
        LibDiamond.enforceIsContractOwner();
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        gs.xp[tokenId][VOID_SKILL_ID] = 0;
    }

    function resetAllVoidLevels(uint256 startId, uint256 endId) external {
        LibDiamond.enforceIsContractOwner();
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        for (uint256 i = startId; i <= endId; i++) {
            gs.xp[i][VOID_SKILL_ID] = 0;
        }
    }
}
