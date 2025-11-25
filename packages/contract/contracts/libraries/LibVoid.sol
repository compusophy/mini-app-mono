// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LibVoid {
    bytes32 constant VOID_STORAGE_POSITION = keccak256("skiller.void.storage");

    struct LeaderboardEntry {
        uint256 tokenId;
        uint256 level;
    }

    struct VoidStorage {
        LeaderboardEntry[100] leaderboard;
        uint256 minScore; // The level of the 100th person (optimization)
    }

    function voidStorage() internal pure returns (VoidStorage storage vs) {
        bytes32 position = VOID_STORAGE_POSITION;
        assembly {
            vs.slot := position
        }
    }
}
