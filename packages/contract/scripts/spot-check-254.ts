
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const tokenId = 254;
    const diamondAddr = addresses.Diamond;
    const newItemsAddr = addresses.SkillerItemsV2;
    const newProfileAddr = addresses.SkillerProfileV2;
    const oldItemsAddr = addresses.SkillerItems;
    const oldProfileAddr = addresses.SkillerProfile;
    const accountImplementation = addresses.ERC6551Account;
    const registryAddr = addresses.ERC6551Registry;

    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    console.log("Checking Skiller #", tokenId);
    
    // Registry Helper
    const Registry = await ethers.getContractAt("IERC6551Registry", registryAddr);
    
    // 1. Get V1 TBA
    const oldTBA = await Registry.account(
        accountImplementation,
        0,
        chainId,
        oldProfileAddr,
        tokenId
    );
    console.log("Old TBA (V1):", oldTBA);

    // 2. Get V2 TBA
    const newTBA = await Registry.account(
        accountImplementation,
        0,
        chainId,
        newProfileAddr,
        tokenId
    );
    console.log("New TBA (V2):", newTBA);

    // 3. Check Old Items Balance (V1)
    const OldItems = await ethers.getContractAt("SkillerItemsV2", oldItemsAddr); // Using generic interface
    const oakLogsV1 = await OldItems.balanceOf(oldTBA, 201);
    console.log(`V1 Oak Logs (201) Balance: ${oakLogsV1}`);
    
    // 4. Check New Items Balance (V2)
    const NewItems = await ethers.getContractAt("SkillerItemsV2", newItemsAddr);
    const oakLogsV2 = await NewItems.balanceOf(newTBA, 201);
    console.log(`V2 Oak Logs (201) Balance: ${oakLogsV2}`);

    // 5. Check Other Items
    const bronzeAxeV2 = await NewItems.balanceOf(newTBA, 101);
    console.log(`V2 Bronze Axe (101): ${bronzeAxeV2}`);
    
    const goldV2 = await NewItems.balanceOf(newTBA, 1);
    console.log(`V2 Gold (1): ${ethers.formatEther(goldV2)}`);

    // 6. Check XP in Diamond
    const GameDiamond = await ethers.getContractAt("GameFacet", diamondAddr);
    try {
        const stats = await GameDiamond.getStats(tokenId);
        console.log("V2 XP Stats:");
        console.log(`  Mining: ${stats[0]}`);
        console.log(`  Woodcutting: ${stats[1]}`);
    } catch (e) {
        console.log("Could not read stats:", e.message);
    }

    // Conclusion
    if (oakLogsV1 > 0 && oakLogsV2 === 0n) {
        console.log("ALERT: V1 Logs existed but were NOT migrated.");
        console.log("Possible reasons: Migration contract approval on V1 items?");
        // Note: Migration contract does NOT need approval to read balance, but it needs to mint on V2.
        // It logic: 
        // uint256 bal = oldItems.balanceOf(oldTBA, itemIds[i]);
        // if (bal > 0) { newItems.mint(newTBA, itemIds[i], bal, ""); }
    } else if (oakLogsV1 == 0) {
        console.log("Observation: No V1 logs found on-chain. XP might be from logs that were sold, burnt, or dropped?");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

