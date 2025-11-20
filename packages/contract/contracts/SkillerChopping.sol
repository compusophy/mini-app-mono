// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SkillerItems.sol";
import "./SkillerProfile.sol";
import "./interfaces/IERC6551Registry.sol";

contract SkillerChopping is Ownable {
    SkillerItems public itemsContract;
    SkillerProfile public profileContract;
    IERC6551Registry public registryContract;
    address public accountImplementation;

    uint256 public constant BRONZE_AXE_ID = 101;
    uint256 public constant PINE_LOG_ID = 201;

    event Chopped(address indexed tba, uint256 amount);

    constructor(
        address _itemsContract, 
        address _profileContract,
        address _registryContract,
        address _accountImplementation,
        address initialOwner
    ) Ownable(initialOwner) {
        itemsContract = SkillerItems(_itemsContract);
        profileContract = SkillerProfile(_profileContract);
        registryContract = IERC6551Registry(_registryContract);
        accountImplementation = _accountImplementation;
    }

    function chopTree(uint256 tokenId) public {
        // 1. Verify ownership of the profile
        require(profileContract.ownerOf(tokenId) == msg.sender, "Not profile owner");

        // 2. Calculate TBA address
        address tba = registryContract.account(
            accountImplementation,
            0,
            block.chainid,
            address(profileContract),
            tokenId
        );

        // 3. Check if TBA has an axe
        uint256 axeBalance = itemsContract.balanceOf(tba, BRONZE_AXE_ID);
        require(axeBalance > 0, "No axe equipped");

        // 4. Mint Wood to the TBA
        // Note: SkillerChopping must be a valid minter on SkillerItems
        itemsContract.mint(tba, PINE_LOG_ID, 1, "");
        
        emit Chopped(tba, 1);
    }

    function updateConfig(
        address _itemsContract, 
        address _profileContract,
        address _registryContract,
        address _accountImplementation
    ) public onlyOwner {
        itemsContract = SkillerItems(_itemsContract);
        profileContract = SkillerProfile(_profileContract);
        registryContract = IERC6551Registry(_registryContract);
        accountImplementation = _accountImplementation;
    }
}
