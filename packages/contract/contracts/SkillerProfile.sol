// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./SkillerItems.sol";
import "./interfaces/IERC6551Registry.sol";

contract SkillerProfile is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    using Strings for uint256;
    using Strings for address;

    uint256 private _nextTokenId = 1;
    
    // Deprecated: userToProfile (was 1-to-1, now using Enumerable for n-to-n)
    // mapping(address => uint256) public userToProfile;

    SkillerItems public itemsContract;
    IERC6551Registry public registry;
    address public accountImplementation;

    constructor(address initialOwner)
        ERC721("SkillerProfile", "SKILL")
        Ownable(initialOwner)
    {}

    function setConfig(address _items, address _registry, address _accountImpl) public onlyOwner {
        itemsContract = SkillerItems(_items);
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImpl;
    }

    function safeMint(address to, string memory uri)
        public
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri); 
        
        // userToProfile[to] = tokenId; // Removed in favor of Enumerable

        if (address(itemsContract) != address(0) && address(registry) != address(0)) {
             address tba = registry.account(
                 accountImplementation,
                 0, // salt
                 block.chainid,
                 address(this),
                 tokenId
             );
             // Mint 1 Bronze Axe (ID 101)
             itemsContract.mint(tba, 101, 1, "");
        }

        return tokenId;
    }

    // The following functions are overrides required by Solidity.

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        _requireOwned(tokenId);

        address tba = address(0);
        uint256 axeBalance = 0;

        if (address(registry) != address(0)) {
            tba = registry.account(
                 accountImplementation,
                 0, 
                 block.chainid,
                 address(this),
                 tokenId
            );
            
            if (address(itemsContract) != address(0)) {
                axeBalance = itemsContract.balanceOf(tba, 101);
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
            '</svg>'
        ));

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name": "Skiller #', tokenId.toString(), '",',
            '"description": "The MMORPG where your profile is a wallet.",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ))));

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
