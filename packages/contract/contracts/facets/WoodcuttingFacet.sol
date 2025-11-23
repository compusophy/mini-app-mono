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

    event Chopped(address indexed tba, uint256 logId, uint256 amount, uint256 xpGained);

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
        require(bronzeAxe > 0 || ironAxe > 0, "No axe equipped");

        if (logId == WILLOW_LOG) {
            require(ironAxe > 0, "Iron Axe required for Willow");
        }

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
            if (ironAxe > 0) {
                // Maybe higher yield for Willow later?
            }
        }

        // Update XP
        gs.xp[tokenId][2] += xp; // Skill 2 = Woodcutting

        // Mint Logs
        gs.items.mint(tba, logId, amount, "");
        
        emit Chopped(tba, logId, amount, xp);
    }
}
