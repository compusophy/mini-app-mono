
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

// Define the structure returned by getLeaderboard
// struct LeaderboardEntry { uint256 tokenId; uint256 level; }

async function main() {
    const diamondAddr = addresses.Diamond;
    const itemsAddr = addresses.SkillerItemsV2;
    const registryAddr = addresses.ERC6551Registry;
    const accountImplementation = addresses.ERC6551Account;
    const profileAddr = addresses.SkillerProfileV2;

    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    console.log(`Checking Leaderboard Gold on Chain ${chainId}`);

    // 1. Get Contracts
    const VoidFacet = await ethers.getContractAt("VoidFacet", diamondAddr);
    const Items = await ethers.getContractAt("SkillerItemsV2", itemsAddr);
    const Registry = await ethers.getContractAt("IERC6551Registry", registryAddr);

    // 2. Fetch Leaderboard
    console.log("Fetching leaderboard...");
    // Note: getLeaderboard returns an array of structs. 
    // Ethers handles this as an array of arrays/objects.
    const leaderboard = await VoidFacet.getLeaderboard();

    // 3. Filter and Process
    const activeEntries = [];
    for (const entry of leaderboard) {
        // entry is [tokenId, level]
        const tokenId = entry[0];
        const level = entry[1];

        if (level > 0n) { // or tokenId > 0n
            activeEntries.push({ tokenId, level });
        }
    }

    console.log(`Found ${activeEntries.length} entries on the leaderboard.`);

    let totalGold = 0n;
    const results = [];

    // 4. Iterate and Check Gold
    console.log("\nFetching Gold balances...");
    console.log("-------------------------------------------------------------");
    console.log("Rank | Token ID | Level | Gold Balance");
    console.log("-------------------------------------------------------------");

    for (let i = 0; i < activeEntries.length; i++) {
        const entry = activeEntries[i];
        const tokenId = entry.tokenId;
        const level = entry.level;

        // Get TBA
        const tba = await Registry.account(
            accountImplementation,
            0,
            chainId,
            profileAddr,
            tokenId
        );

        // Get Gold
        const goldBalance = await Items.balanceOf(tba, 1);
        totalGold += goldBalance;

        // Store result
        const goldFormatted = ethers.formatEther(goldBalance);
        results.push({
            rank: i + 1,
            tokenId: tokenId.toString(),
            level: level.toString(),
            gold: parseFloat(goldFormatted),
            goldRaw: goldBalance
        });

        console.log(`${(i + 1).toString().padEnd(4)} | ${tokenId.toString().padEnd(8)} | ${level.toString().padEnd(5)} | ${goldFormatted}`);
    }

    // 5. Stats
    console.log("-------------------------------------------------------------");
    
    const count = BigInt(results.length);
    if (count > 0n) {
        const averageGold = totalGold / count;
        const totalFormatted = ethers.formatEther(totalGold);
        const avgFormatted = ethers.formatEther(averageGold);

        console.log(`\nTotal Gold:   ${totalFormatted}`);
        console.log(`Average Gold: ${avgFormatted}`);
        console.log(`Count:        ${count}`);
    } else {
        console.log("No entries found.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

