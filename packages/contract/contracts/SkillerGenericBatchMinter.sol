// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IItems {
    function mint(address to, uint256 id, uint256 amount, bytes memory data) external;
}

contract SkillerGenericBatchMinter {
    IItems public items;
    address public owner;

    constructor(address _items) {
        items = IItems(_items);
        owner = msg.sender;
    }

    struct MintOp {
        address to;
        uint256 id;
        uint256 amount;
    }

    function mintBatch(MintOp[] calldata ops) external {
        require(msg.sender == owner, "Not owner");
        for (uint256 i = 0; i < ops.length; i++) {
            items.mint(ops[i].to, ops[i].id, ops[i].amount, "");
        }
    }
}

