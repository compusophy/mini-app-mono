// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../tokens/SkillerProfileV2.sol";
import "../tokens/SkillerItemsV2.sol";
import "../interfaces/IERC6551Registry.sol";

interface ISkillerItems {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function burn(address account, uint256 id, uint256 value) external;
}

interface IOldSkillerXP {
    function profileXp(uint256 tokenId) external view returns (uint256);
}

interface IDiamond {
    function adminSetXP(uint256 tokenId, uint256 miningXp, uint256 woodcuttingXp) external;
}

contract SkillerMigration is Ownable {
    IERC721 public oldProfile;
    ISkillerItems public oldItems;
    IERC6551Registry public registry;
    address public accountImplementation;

    SkillerProfileV2 public newProfile;
    SkillerItemsV2 public newItems;
    address public diamond;

    // Old XP Contracts
    address public oldMining;
    address public oldWoodcutting;

    mapping(uint256 => bool) public migrated;

    constructor(
        address _oldProfile,
        address _oldItems,
        address _registry,
        address _accountImpl,
        address _newProfile,
        address _newItems,
        address _diamond,
        address _oldMining,
        address _oldWoodcutting,
        address initialOwner
    ) Ownable(initialOwner) {
        oldProfile = IERC721(_oldProfile);
        oldItems = ISkillerItems(_oldItems);
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImpl;
        newProfile = SkillerProfileV2(_newProfile);
        newItems = SkillerItemsV2(_newItems);
        diamond = _diamond;
        oldMining = _oldMining;
        oldWoodcutting = _oldWoodcutting;
    }

    function migrate(uint256 tokenId) external {
        // 1. Verify ownership of old profile
        require(oldProfile.ownerOf(tokenId) == msg.sender, "Not owner of old profile");
        require(!migrated[tokenId], "Already migrated");

        // 2. "Burn" old profile (Transfer to this contract to lock it)
        oldProfile.transferFrom(msg.sender, address(this), tokenId);

        // 3. Mint new profile (Same Token ID)
        newProfile.mintSpecific(msg.sender, tokenId);
        
        // 4. Get Old TBA and New TBA
        address oldTBA = registry.account(
            accountImplementation,
            0,
            block.chainid,
            address(oldProfile),
            tokenId
        );

        address newTBA = registry.account(
            accountImplementation,
            0,
            block.chainid,
            address(newProfile),
            tokenId
        );
        
        // 5. Migrate Items
        // Items to check: Bronze Axe (101), Bronze Pickaxe (151), Oak/Pine Log (201), Iron/Copper Ore (301)
        uint256[] memory itemIds = new uint256[](4);
        itemIds[0] = 101; 
        itemIds[1] = 151; 
        itemIds[2] = 201; 
        itemIds[3] = 301; 
        
        for (uint256 i = 0; i < itemIds.length; i++) {
            uint256 bal = oldItems.balanceOf(oldTBA, itemIds[i]);
            if (bal > 0) {
                newItems.mint(newTBA, itemIds[i], bal, "");
            }
        }

        // 6. Ensure Starter Pack & Bonus
        if (newItems.balanceOf(newTBA, 101) == 0) {
            newItems.mint(newTBA, 101, 1, ""); // Gift Bronze Axe
        }
        if (newItems.balanceOf(newTBA, 151) == 0) {
            newItems.mint(newTBA, 151, 1, ""); // Gift Bronze Pickaxe
        }

        // Gift 25 Gold Coins (ID 1)
        newItems.mint(newTBA, 1, 25 * 10**18, "");

        // 7. Migrate XP
        // We need to read XP from old contracts and set it in V2
        // Assuming Diamond has an adminSetXP function exposed (we need to add this via AdminFacet)
        uint256 miningXp = 0;
        uint256 woodcuttingXp = 0;

        if (oldMining != address(0)) {
            try IOldSkillerXP(oldMining).profileXp(tokenId) returns (uint256 xp) {
                miningXp = xp;
            } catch {}
        }
        if (oldWoodcutting != address(0)) {
            try IOldSkillerXP(oldWoodcutting).profileXp(tokenId) returns (uint256 xp) {
                woodcuttingXp = xp;
            } catch {}
        }

        // Bonus: Grant Iron Tools for Veterans (Level 5+ approx 1600 XP)
        if (miningXp >= 1600) {
             if (newItems.balanceOf(newTBA, 152) == 0) {
                newItems.mint(newTBA, 152, 1, ""); // Gift Iron Pickaxe
            }
        }
        if (woodcuttingXp >= 1600) {
             if (newItems.balanceOf(newTBA, 102) == 0) {
                newItems.mint(newTBA, 102, 1, ""); // Gift Iron Axe
            }
        }

        if (miningXp > 0 || woodcuttingXp > 0) {
            try IDiamond(diamond).adminSetXP(tokenId, miningXp, woodcuttingXp) {
                // Success
            } catch {
                // Fail silently if Diamond doesn't support it yet to not block migration
            }
        }

        migrated[tokenId] = true;
    }

    function recoverOwnership(address target, address newOwner) external onlyOwner {
        Ownable(target).transferOwnership(newOwner);
    }
}
