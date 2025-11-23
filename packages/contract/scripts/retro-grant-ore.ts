
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    const Registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    const accountImpl = addresses.ERC6551Account;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const totalProfiles = await ProfileV2.totalSupply();
    console.log(`Total Profiles: ${totalProfiles}`);

    // Constants
    // Mining XP per Iron Ore = 10 (Standard Action)
    // XP = 100 if Iron Pickaxe used? 
    // Let's look at MiningFacet.sol:
    // if (oreId == IRON_ORE) { if (ironPick > 0) { amount=10; xp=100; } else { amount=1; xp=10; } }
    // So roughly 1 Ore per 10 XP is the baseline ratio.
    // If they used Iron Pickaxe, they got 10 Ore per 100 XP, which is still 1 Ore / 10 XP ratio.
    // So: Expected Iron Ore = Mining XP / 10.
    
    // For Logs:
    // Oak Log: 10 XP = 1 Log. (Iron Axe -> 100 XP = 10 Logs). Ratio 1:10.
    // Willow Log: 25 XP = 1 Log.
    // We can't distinguish Oak vs Willow XP easily as it's aggregated in skillId 2.
    // However, if we assume mostly Oak for now (as Willow just launched or is higher level),
    // we could estimate Logs = Woodcutting XP / 10.
    
    // User asked for Iron Ore specifically.
    // We should check CURRENT balance vs EXPECTED balance.
    // Only mint the difference if Expected > Current.
    // Note: They might have crafted/burnt items. We can't know that.
    // "retro active grant... according to experience" implies "give them what they earned".
    // If they spent it, we might be double-giving. But user seems to want to restore lost items.
    // Let's calculate: Target = XP / 10.
    // Grant = Target - Current. If < 0, do nothing.

    for (let i = 0; i < totalProfiles; i++) {
        try {
            const tokenId = await ProfileV2.tokenByIndex(i);
            console.log(`\nChecking Profile #${tokenId}...`);

            // 1. Get XP
            const stats = await GameDiamond.getStats(tokenId);
            const miningXp = stats.miningXp;
            const woodcuttingXp = stats.woodcuttingXp;

            console.log(` - XP: Mining=${miningXp}, Wood=${woodcuttingXp}`);

            // 2. Calculate Expected Iron Ore (ID 301)
            // 1 Ore per 10 XP
            const expectedOre = miningXp / 10n;
            
            // 3. Get Current Balance
            const v2TBA = await Registry.account(
                accountImpl,
                0,
                chainId,
                addresses.SkillerProfileV2,
                tokenId
            );
            const currentOre = await ItemsV2.balanceOf(v2TBA, 301n);
            
            console.log(` - Iron Ore: Current=${currentOre}, Expected (from XP)=${expectedOre}`);

            if (expectedOre > currentOre) {
                const diff = expectedOre - currentOre;
                console.log(`   -> Granting ${diff} Iron Ore...`);
                const tx = await ItemsV2.mint(v2TBA, 301n, diff, "0x");
                await tx.wait();
                console.log("   -> Done!");
            } else {
                console.log("   -> Balance sufficient.");
            }

            // Optional: Do same for Wood? (ID 201)
            // User only asked for Iron Ore, but Wood is similar.
            // Let's stick to user request "give them iron ore" for now to be safe.

        } catch (e) {
            console.error(`Error processing index ${i}:`, e);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

