// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./interfaces/ISkillerDescriptor.sol";
import "./tokens/SkillerProfileV2.sol";
import "./tokens/SkillerItemsV2.sol";
import "./interfaces/IERC6551Registry.sol";

contract SkillerDescriptorV2 is ISkillerDescriptor {
    using Strings for uint256;
    using Strings for address;

    function tokenURI(address profileContract, uint256 tokenId) external view override returns (string memory) {
        SkillerProfileV2 profile = SkillerProfileV2(profileContract);
        
        SkillerItemsV2 itemsContract = SkillerItemsV2(profile.itemsContract());
        IERC6551Registry registry = profile.registry();
        address accountImplementation = profile.accountImplementation();

        address tba = address(0);
        
        // Inventory Balances
        uint256 bronzeAxe = 0;
        uint256 ironAxe = 0;
        uint256 oakLog = 0;
        uint256 willowLog = 0;
        uint256 ironOre = 0;
        uint256 coalOre = 0;
        uint256 bronzePick = 0;
        uint256 ironPick = 0;

        if (address(registry) != address(0)) {
            tba = registry.account(
                 accountImplementation,
                 0, 
                 block.chainid,
                 address(profile),
                 tokenId
            );
            
            if (address(itemsContract) != address(0)) {
                bronzeAxe = itemsContract.balanceOf(tba, 101);
                ironAxe = itemsContract.balanceOf(tba, 102);
                
                bronzePick = itemsContract.balanceOf(tba, 151);
                ironPick = itemsContract.balanceOf(tba, 152);

                oakLog = itemsContract.balanceOf(tba, 201);
                willowLog = itemsContract.balanceOf(tba, 202);
                
                ironOre = itemsContract.balanceOf(tba, 301);
                coalOre = itemsContract.balanceOf(tba, 302);
            }
        }

        string memory tbaStr = Strings.toHexString(uint160(tba), 20);

        // Build SVG
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 500">',
            '<style>.base { fill: white; font-family: serif; font-size: 14px; } .title { fill: gold; font-size: 18px; font-weight: bold; }</style>',
            '<rect width="100%" height="100%" fill="#1a1a1a" />',
            '<text x="10" y="30" class="title">Skiller #', tokenId.toString(), '</text>',
            '<text x="10" y="55" class="base" font-size="10">TBA: ', tbaStr, '</text>',
            
            '<text x="10" y="90" class="base" font-weight="bold">Woodcutting:</text>',
            '<text x="20" y="110" class="base">Bronze Axe: ', bronzeAxe.toString(), '</text>',
            '<text x="20" y="130" class="base">Iron Axe: ', ironAxe.toString(), '</text>',
            '<text x="20" y="150" class="base">Oak Logs: ', oakLog.toString(), '</text>',
            '<text x="20" y="170" class="base">Willow Logs: ', willowLog.toString(), '</text>',

            '<text x="10" y="210" class="base" font-weight="bold">Mining:</text>',
            '<text x="20" y="230" class="base">Bronze Pick: ', bronzePick.toString(), '</text>',
            '<text x="20" y="250" class="base">Iron Pick: ', ironPick.toString(), '</text>',
            '<text x="20" y="270" class="base">Iron Ore: ', ironOre.toString(), '</text>',
            '<text x="20" y="290" class="base">Coal: ', coalOre.toString(), '</text>',
            '</svg>'
        ));

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name": "Skiller #', tokenId.toString(), '",',
            '"description": "Skiller V2 Profile. The MMORPG where your profile is a wallet.",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ))));

        return string(abi.encodePacked("data:application/json;base64,", json));
    }
}

