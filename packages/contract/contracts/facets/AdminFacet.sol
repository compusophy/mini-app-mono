// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/LibGame.sol";
import "../libraries/LibDiamond.sol";

contract AdminFacet {
    function setGameConfig(address _items, address _profile, address _registry, address _accountImpl) external {
        LibDiamond.enforceIsContractOwner();
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        gs.items = SkillerItemsV2(_items);
        gs.profile = SkillerProfileV2(_profile);
        gs.registry = IERC6551Registry(_registry);
        gs.accountImplementation = _accountImpl;
    }

    function setMigrationContract(address _migration) external {
        LibDiamond.enforceIsContractOwner();
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        gs.migrationContract = _migration;
    }

    function adminSetXP(uint256 tokenId, uint256 miningXp, uint256 woodcuttingXp) external {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        
        // Allow owner or migration contract
        // Note: gs.migrationContract might not be set yet, so allow owner too.
        // Migration contract calls this.
        bool isOwner = msg.sender == LibDiamond.contractOwner();
        bool isMigration = msg.sender == gs.migrationContract;
        
        // If migration contract isn't set in storage, we can't check it securely unless we rely on `isOwner` 
        // (which deployer is). The migration contract itself is NOT the owner.
        // So we MUST set migrationContract in storage for this to work for the contract.
        
        if (!isOwner && !isMigration) {
             revert("Not authorized");
        }

        gs.xp[tokenId][1] = miningXp; // Skill 1: Mining
        gs.xp[tokenId][2] = woodcuttingXp; // Skill 2: Woodcutting
    }

    function setMinGameVersion(uint256 _version) external {
        LibDiamond.enforceIsContractOwner();
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        gs.minGameVersion = _version;
    }
}
