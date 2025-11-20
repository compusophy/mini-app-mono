// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./SkillerItems.sol";
import "./interfaces/IERC6551Registry.sol";
import "./interfaces/ISkillerDescriptor.sol";

contract SkillerProfile is ERC721, ERC721Enumerable, Ownable {
    using Strings for uint256;
    using Strings for address;

    uint256 private _nextTokenId = 1;
    
    SkillerItems public itemsContract;
    IERC6551Registry public registry;
    address public accountImplementation;
    ISkillerDescriptor public descriptor;

    constructor(address initialOwner)
        ERC721("SkillerProfile", "SKILL")
        Ownable(initialOwner)
    {}

    function setConfig(address _items, address _registry, address _accountImpl, address _descriptor) public onlyOwner {
        itemsContract = SkillerItems(_items);
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImpl;
        descriptor = ISkillerDescriptor(_descriptor);
    }

    function setDescriptor(address _descriptor) public onlyOwner {
        descriptor = ISkillerDescriptor(_descriptor);
    }

    // Removed uri param since we generate it dynamically now
    function safeMint(address to)
        public
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        
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
        override(ERC721)
        returns (string memory)
    {
        _requireOwned(tokenId);

        if (address(descriptor) != address(0)) {
            return descriptor.tokenURI(address(this), tokenId);
        }

        // Fallback if no descriptor set
        return "";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
