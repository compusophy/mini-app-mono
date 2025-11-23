// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/ISkillerDescriptor.sol";
import "../interfaces/IERC6551Registry.sol";

contract SkillerProfileV2 is 
    ERC721Upgradeable, 
    ERC721EnumerableUpgradeable, 
    OwnableUpgradeable, 
    UUPSUpgradeable 
{
    using Strings for uint256;

    uint256 private _nextTokenId;
    
    address public itemsContract;
    IERC6551Registry public registry;
    address public accountImplementation;
    ISkillerDescriptor public descriptor;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __ERC721_init("SkillerProfile", "SKILL");
        __ERC721Enumerable_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        _nextTokenId = 1;
    }

    function setConfig(address _items, address _registry, address _accountImpl, address _descriptor) public onlyOwner {
        itemsContract = _items;
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImpl;
        descriptor = ISkillerDescriptor(_descriptor);
    }

    function setDescriptor(address _descriptor) public onlyOwner {
        descriptor = ISkillerDescriptor(_descriptor);
    }

    function safeMint(address to) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        
        // Note: We do NOT mint the initial items here anymore. 
        // The migration contract or game logic will handle starting items if needed.
        // Or we can keep it if desired, but for migration it's better to separate concerns.
        // For new users, the Game Diamond can handle "initialization".
        
        return tokenId;
    }

    function mintSpecific(address to, uint256 tokenId) public onlyOwner {
        _safeMint(to, tokenId);
        // Update _nextTokenId if we mint a higher one to avoid collisions
        if (tokenId >= _nextTokenId) {
            _nextTokenId = tokenId + 1;
        }
    }

    // Required overrides
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);

        if (address(descriptor) != address(0)) {
            return descriptor.tokenURI(address(this), tokenId);
        }

        return "";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

