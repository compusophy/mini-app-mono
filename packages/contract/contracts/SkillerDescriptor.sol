// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./interfaces/ISkillerDescriptor.sol";
import "./SkillerProfile.sol";
import "./SkillerItems.sol";
import "./interfaces/IERC6551Registry.sol";

contract SkillerDescriptor is ISkillerDescriptor {
    using Strings for uint256;
    using Strings for address;

    function tokenURI(address profileContract, uint256 tokenId) external view override returns (string memory) {
        SkillerProfile profile = SkillerProfile(profileContract);
        
        SkillerItems itemsContract = profile.itemsContract();
        IERC6551Registry registry = profile.registry();
        address accountImplementation = profile.accountImplementation();

        address tba = address(0);
        uint256 axeBalance = 0;
        uint256 woodBalance = 0;

        if (address(registry) != address(0)) {
            tba = registry.account(
                 accountImplementation,
                 0, 
                 block.chainid,
                 address(profile),
                 tokenId
            );
            
            if (address(itemsContract) != address(0)) {
                // This is the part we can easily update by deploying a new Descriptor!
                // We can add new items here without redeploying the Profile or Items contracts.
                axeBalance = itemsContract.balanceOf(tba, 101);
                woodBalance = itemsContract.balanceOf(tba, 201);
            }
        }

        string memory tbaStr = Strings.toHexString(uint160(tba), 20);

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 350">',
            '<style>.base { fill: white; font-family: serif; font-size: 14px; }</style>',
            '<rect width="100%" height="100%" fill="black" />',
            '<text x="10" y="20" class="base">Skiller #', tokenId.toString(), '</text>',
            '<text x="10" y="40" class="base">TBA: ', tbaStr, '</text>',
            '<text x="10" y="60" class="base">Inventory:</text>',
            '<text x="10" y="80" class="base">- Bronze Axe: ', axeBalance.toString(), '</text>',
            '<text x="10" y="100" class="base">- Pine Log: ', woodBalance.toString(), '</text>',
            '</svg>'
        ));

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name": "Skiller #', tokenId.toString(), '",',
            '"description": "The MMORPG where your profile is a wallet.",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ))));

        return string(abi.encodePacked("data:application/json;base64,", json));
    }
}

