// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IItems {
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external;
}

contract SkillerBatchMinter {
    IItems public items;
    address public owner;

    constructor(address _items) {
        items = IItems(_items);
        owner = msg.sender;
    }

    struct ResyncData {
        address to;
        uint256 woodXp;
        uint256 miningXp;
    }

    function resyncBatch(ResyncData[] calldata data) external {
        require(msg.sender == owner, "Not owner");

        // Items:
        // 101: Bronze Axe (1)
        // 151: Bronze Pickaxe (1)
        // 1: Gold (25)
        // 201: Oak Logs (calculated)
        // 301: Iron Ore (calculated)
        
        // Note: We assume the inputs (woodXp, miningXp) are the raw XP values.
        // Calculation: 
        // Wood = XP / 10
        // Ore = XP / 10
        // Max check? No, just simple divide.

        uint256[] memory ids = new uint256[](5);
        ids[0] = 101; 
        ids[1] = 151;
        ids[2] = 1;
        ids[3] = 201;
        ids[4] = 301;

        for (uint256 i = 0; i < data.length; i++) {
            uint256[] memory amounts = new uint256[](5);
            amounts[0] = 1;
            amounts[1] = 1;
            amounts[2] = 25 * 10**18;
            amounts[3] = data[i].woodXp / 10;
            amounts[4] = data[i].miningXp / 10;
            
            // Safety check: ensure non-zero amounts if needed?
            // mintBatch usually handles 0 amounts fine (just emits 0), or we can optimize.
            // But let's just send it.
            
            items.mintBatch(data[i].to, ids, amounts, "");
        }
    }
}

