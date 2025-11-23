
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const tokenId = 64;
    const diamondAddr = addresses.Diamond;
    const newItemsAddr = addresses.SkillerItemsV2;
    const newProfileAddr = addresses.SkillerProfileV2;
    const oldItemsAddr = addresses.SkillerItems;
    const oldProfileAddr = addresses.SkillerProfile;
    const accountImplementation = addresses.ERC6551Account;
    const registryAddr = addresses.ERC6551Registry;

    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    console.log("Checking Skiller #", tokenId);
    console.log("Deployer:", deployer.address);
    
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
    const ironOreV2 = await NewItems.balanceOf(newTBA, 301);
    console.log(`V2 Oak Logs (201) Balance: ${oakLogsV2}`);
    console.log(`V2 Iron Ore (301) Balance: ${ironOreV2}`);

    // 5. Check Other Items
    const bronzeAxeV2 = await NewItems.balanceOf(newTBA, 101);
    console.log(`V2 Bronze Axe (101): ${bronzeAxeV2}`);
    
    const goldV2 = await NewItems.balanceOf(newTBA, 1);
    console.log(`V2 Gold (1): ${ethers.formatEther(goldV2)}`);

    // 6. Check XP in Diamond and Fix
    const GameDiamond = await ethers.getContractAt("GameFacet", diamondAddr);
    try {
        const stats = await GameDiamond.getStats(tokenId);
        const miningXp = stats[0]; // Mining
        const woodcuttingXp = stats[1]; // Woodcutting

        console.log("V2 XP Stats:");
        console.log(`  Mining: ${miningXp}`);
        console.log(`  Woodcutting: ${woodcuttingXp}`);

        // FIX LOGIC
        const expectedIronOre = miningXp / 10n;
        const expectedOakLogs = woodcuttingXp / 10n;

        console.log(`\n--- Fixing Items ---`);
        console.log(`Expected Iron Ore: ${expectedIronOre} (Current: ${ironOreV2})`);
        console.log(`Expected Oak Logs: ${expectedOakLogs} (Current: ${oakLogsV2})`);

        // Check Minter Role
        const isMinter = await NewItems.minters(deployer.address);
        if (!isMinter) {
             console.log("Deployer is NOT a minter. Attempting to grant role...");
             await (await NewItems.setMinter(deployer.address, true)).wait();
             console.log("Minter role granted.");
        }

        // Mint Iron Ore
        if (expectedIronOre > ironOreV2) {
            const diff = expectedIronOre - ironOreV2;
            console.log(`Minting ${diff} Iron Ore...`);
            await (await NewItems.mint(newTBA, 301, diff, "0x")).wait();
            console.log("Done.");
        } else {
            console.log("Iron Ore balance is sufficient.");
        }

        // Mint Oak Logs
        if (expectedOakLogs > oakLogsV2) {
            const diff = expectedOakLogs - oakLogsV2;
            console.log(`Minting ${diff} Oak Logs...`);
            await (await NewItems.mint(newTBA, 201, diff, "0x")).wait();
            console.log("Done.");
        } else {
            console.log("Oak Logs balance is sufficient.");
        }

    } catch (e: any) {
        console.log("Error during fix:", e.message || e);
    }

    // Conclusion
    if (oakLogsV1 > 0n && oakLogsV2 === 0n) {
        console.log("ALERT: V1 Logs existed but were NOT migrated.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
