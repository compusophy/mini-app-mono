// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../tokens/SkillerItemsV2.sol";
import "../tokens/SkillerProfileV2.sol";
import "../interfaces/IERC6551Registry.sol";

library LibGame {
    bytes32 constant GAME_STORAGE_POSITION = keccak256("skiller.game.storage");

    struct LeaderboardEntry {
        uint256 tokenId;
        uint256 level;
    }

    struct GameStorage {
        SkillerItemsV2 items;
        SkillerProfileV2 profile;
        IERC6551Registry registry;
        address accountImplementation;
        
        // Mapping from Item ID to basic properties (if we need on-chain data)
        // For now, much logic can be in facets, but we can store global config here.
        mapping(uint256 => uint256) itemLevelRequirements;
        
        // Experience storage
        mapping(uint256 => mapping(uint256 => uint256)) xp; // tokenId -> skillId -> xp
        address migrationContract;

        // Void Leaderboard (Top 100)
        LeaderboardEntry[100] voidLeaderboard;
        uint256 minLeaderboardLevel;
    }

    function gameStorage() internal pure returns (GameStorage storage gs) {
        bytes32 position = GAME_STORAGE_POSITION;
        assembly {
            gs.slot := position
        }
    }

    // Helper to get TBA address
    function getTBA(uint256 tokenId) internal view returns (address) {
        GameStorage storage gs = gameStorage();
        return gs.registry.account(
            gs.accountImplementation,
            0,
            block.chainid,
            address(gs.profile),
            tokenId
        );
    }
}

