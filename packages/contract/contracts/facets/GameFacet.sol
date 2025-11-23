// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract GameFacet {
    // Starter Items
    uint256 constant BRONZE_AXE = 101;
    uint256 constant BRONZE_PICKAXE = 151;
    uint256 constant GOLD_COINS = 1; 

    uint256 constant IRON_AXE = 102;
    uint256 constant IRON_PICKAXE = 152;

    event CharacterCreated(uint256 tokenId, address tba);
    event ItemClaimed(uint256 tokenId, uint256 itemId);

    function createCharacter() external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        
        uint256 tokenId = gs.profile.safeMint(msg.sender);
        
        address tba = gs.registry.account(
            gs.accountImplementation,
            0,
            block.chainid,
            address(gs.profile),
            tokenId
        );

        uint256[] memory ids = new uint256[](3);
        ids[0] = BRONZE_AXE;
        ids[1] = BRONZE_PICKAXE;
        ids[2] = GOLD_COINS;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1;
        amounts[1] = 1;
        amounts[2] = 25 * 10**18; 
        
        gs.items.mintBatch(tba, ids, amounts, "");
        
        emit CharacterCreated(tokenId, tba);
    }

    function claimStarterPickaxe(uint256 tokenId) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        require(gs.profile.ownerOf(tokenId) == msg.sender, "Not owner");
        
        address tba = LibGame.getTBA(tokenId);

        uint256 bronzeBal = gs.items.balanceOf(tba, BRONZE_PICKAXE);
        uint256 ironBal = gs.items.balanceOf(tba, IRON_PICKAXE);

        require(bronzeBal == 0 && ironBal == 0, "Already have a pickaxe");

        gs.items.mint(tba, BRONZE_PICKAXE, 1, "");
        
        emit ItemClaimed(tokenId, BRONZE_PICKAXE);
    }

    // XP Getters
    function getXP(uint256 tokenId, uint256 skillId) external view returns (uint256) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        return gs.xp[tokenId][skillId];
    }

    // Helper for all stats
    function getStats(uint256 tokenId) external view returns (uint256 miningXp, uint256 woodcuttingXp) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        miningXp = gs.xp[tokenId][1];
        woodcuttingXp = gs.xp[tokenId][2];
    }
}
