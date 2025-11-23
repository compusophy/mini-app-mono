// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "../libraries/LibGame.sol";

contract QuestFacet is IERC1155Receiver {
    // Events
    event QuestCompleted(address indexed tba, uint256 questId, uint256 reward);

    // Item IDs
    uint256 constant GOLD_COINS = 1;
    uint256 constant OAK_LOG = 201;
    uint256 constant IRON_ORE = 301;

    function onERC1155Received(
        address, // operator
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external override returns (bytes4) {
        LibGame.GameStorage storage gs = LibGame.gameStorage();
        
        // Filter: Only accept items from SkillerItems (V2)
        // We MUST check this to prevent fake tokens triggering rewards
        require(msg.sender == address(gs.items), "QuestFacet: Invalid token contract");
        
        // Decode Quest ID from data
        // If data is empty or too short, we just accept the transfer but don't process quest
        if (data.length < 32) {
             return this.onERC1155Received.selector;
        }

        uint256 questId = abi.decode(data, (uint256));
        
        if (questId == 1) {
            // Contribute 20 Oak Logs
            require(id == OAK_LOG, "Quest 1: Must be Oak Logs");
            require(value == 20, "Quest 1: Must be 20 items");
            
            // Reward: 100 Gold
            gs.items.mint(from, GOLD_COINS, 100 * 10**18, "");
            emit QuestCompleted(from, questId, 100 * 10**18);
        } else if (questId == 2) {
             // Contribute 20 Iron Ore
             require(id == IRON_ORE, "Quest 2: Must be Iron Ore");
             require(value == 20, "Quest 2: Must be 20 items");
             
             gs.items.mint(from, GOLD_COINS, 100 * 10**18, "");
             emit QuestCompleted(from, questId, 100 * 10**18);
        } else {
            revert("QuestFacet: Invalid Quest ID");
        }

        // Burn the items (Send to Dead)
        // The items are now owned by THIS contract (Diamond)
        gs.items.safeTransferFrom(address(this), address(0x000000000000000000000000000000000000dEaD), id, value, "");

        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external override returns (bytes4) {
        revert("QuestFacet: Batch not supported");
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}

