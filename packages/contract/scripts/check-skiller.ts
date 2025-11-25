
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    // Get Token ID from command line args, default to 989
    const args = process.argv.slice(2);
    const tokenIdStr = args[0] || "989";
    const tokenId = parseInt(tokenIdStr);
    
    if (isNaN(tokenId)) {
        console.error("Invalid Token ID");
        process.exit(1);
    }

    const diamondAddr = addresses.Diamond;
    const newItemsAddr = addresses.SkillerItemsV2;
    const newProfileAddr = addresses.SkillerProfileV2;
    const accountImplementation = addresses.ERC6551Account;
    const registryAddr = addresses.ERC6551Registry;

    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    console.log(`Checking Skiller #${tokenId} on Chain ${chainId}`);

    // 1. Get TBA (V2)
    const Registry = await ethers.getContractAt("IERC6551Registry", registryAddr);
    const tba = await Registry.account(
        accountImplementation,
        0,
        chainId,
        newProfileAddr,
        tokenId
    );
    console.log(`TBA Address: ${tba}`);

    // 2. Get Levels and XP
    // We use StatsFacet interface to call the Diamond
    const StatsFacet = await ethers.getContractAt("StatsFacet", diamondAddr);
    try {
        const stats = await StatsFacet.getStats(tokenId);
        
        // StatsFacet.getStats returns (miningXp, miningLevel, woodcuttingXp, woodcuttingLevel)
        const miningXp = stats[0];
        const miningLevel = stats[1];
        const woodcuttingXp = stats[2];
        const woodcuttingLevel = stats[3];

        console.log(`\n--- Stats ---`);
        console.log(`Mining Level: ${miningLevel} (XP: ${miningXp})`);
        console.log(`Woodcutting Level: ${woodcuttingLevel} (XP: ${woodcuttingXp})`);
    } catch (e) {
        console.log("Error fetching stats. Ensure StatsFacet is linked to Diamond.");
        console.error(e);
    }

    // 3. Get Item Balances
    const Items = await ethers.getContractAt("SkillerItemsV2", newItemsAddr);

    const itemIds = {
        "Gold": 1,
        "Oak Log": 201,
        "Willow Log": 202,
        "Iron Ore": 301,
        "Coal Ore": 302,
        "Mining Charm": 401,
        "Woodcutting Charm": 402
    };

    console.log(`\n--- Inventory ---`);
    for (const [name, id] of Object.entries(itemIds)) {
        const balance = await Items.balanceOf(tba, id);
        let displayBalance = balance.toString();
        if (id === 1) {
            // Format Gold (18 decimals)
            displayBalance = ethers.formatEther(balance);
        }
        console.log(`${name} (ID ${id}): ${displayBalance}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

