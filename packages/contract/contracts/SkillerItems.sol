// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SkillerItems is ERC1155, Ownable {
    constructor(address initialOwner)
        ERC1155("https://api.skiller.game/item/{id}.json")
        Ownable(initialOwner)
    {}

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    mapping(address => bool) public minters;

    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "Not a minter");
        _;
    }

    function setMinter(address minter, bool status) public onlyOwner {
        minters[minter] = status;
    }

    function mint(address account, uint256 id, uint256 amount, bytes memory data)
        public
        onlyMinter
    {
        _mint(account, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        public
        onlyOwner
    {
        _mintBatch(to, ids, amounts, data);
    }
}

