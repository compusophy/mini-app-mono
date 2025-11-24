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
        } else if (questId == 3) {
            // King's Tribute: Contribute 1000 Gold Coins
            require(id == GOLD_COINS, "Quest 3: Must be Gold Coins");
            require(value == 1000 * 10**18, "Quest 3: Must be 1000 Gold");

            // Pseudo-random 0-200 (represents 0.00x to 2.00x)
            // Include gasleft() to add more variance within the same block/user context
            uint256 seed = uint256(keccak256(abi.encodePacked(
                block.timestamp, 
                block.prevrandao, 
                msg.sender, // usage of msg.sender (items contract) doesn't add entropy, but `from` does
                from, 
                id, 
                value,
                gasleft() // Add gasleft for more entropy
            )));
            uint256 multiplier = seed % 201; 
            
            uint256 reward = (value * multiplier) / 100;
            
            if (reward > 0) {
                gs.items.mint(from, GOLD_COINS, reward, "");
            }
            emit QuestCompleted(from, questId, reward);
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

