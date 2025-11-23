import { ethers } from "hardhat";
import path from "path";
import fs from "fs";

async function main() {
    const [deployer] = await ethers.getSigners();
    // Load addresses manually to ensure we get the latest
    const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

    console.log("Reissuing items based on XP for V2 profiles...");
    console.log("Deployer:", deployer.address);
    console.log("ItemsV2:", addresses.SkillerItemsV2);

    const Registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    // Use FIXED Account Implementation
    const accountImpl = addresses.ERC6551Account;
    
    // We can filter by specific IDs if needed, or run for all.
    // The user said "Item resync must be run again... for ore and logs appropriately to their balanced xvs the new xp"
    // Safe to run for all as it checks diff.
    
    const totalProfiles = await ProfileV2.totalSupply();
    console.log(`Total V2 Profiles: ${totalProfiles}`);

    // Item IDs
    const BRONZE_AXE = 101n;
    const BRONZE_PICKAXE = 151n;
    const IRON_AXE = 102n;
    const IRON_PICKAXE = 152n;
    const OAK_LOG = 201n;
    const IRON_ORE = 301n;
    const GOLD_COINS = 1n;

    // Helper to wait for nonce sync
    const waitForNonceSync = async (minWaitMs = 2000) => {
        const pending = await ethers.provider.getTransactionCount(deployer.address, "pending");
        const latest = await ethers.provider.getTransactionCount(deployer.address, "latest");
        if (pending !== latest) {
            console.log(`   Waiting for nonce sync (P:${pending} L:${latest})...`);
            await new Promise(r => setTimeout(r, 2000));
        }
    };

    for (let i = 0; i < totalProfiles; i++) {
        try {
            const tokenId = await ProfileV2.tokenByIndex(i);
            console.log(`\nChecking Profile #${tokenId}...`);

            // 1. Get NEW TBA Address
            const tba = await Registry.account(
                accountImpl,
                0,
                chainId,
                addresses.SkillerProfileV2,
                tokenId
            );

            // 2. XP Check
            const stats = await GameDiamond.getStats(tokenId);
            const miningXp = stats.miningXp;
            const woodcuttingXp = stats.woodcuttingXp;
            
            // 3. Items Check
            const bAxe = await ItemsV2.balanceOf(tba, BRONZE_AXE);
            const iAxe = await ItemsV2.balanceOf(tba, IRON_AXE);
            const bPick = await ItemsV2.balanceOf(tba, BRONZE_PICKAXE);
            const iPick = await ItemsV2.balanceOf(tba, IRON_PICKAXE);
            const gold = await ItemsV2.balanceOf(tba, GOLD_COINS);

            // Prepare Batch Mint arrays
            let ids: bigint[] = [];
            let amounts: bigint[] = [];

            // Starter Items Check (Only if XP > 0 or they are brand new?)
            // Actually everyone should have starter items.
            if (bAxe === 0n && iAxe === 0n) {
                ids.push(BRONZE_AXE);
                amounts.push(1n);
            }

            if (bPick === 0n && iPick === 0n) {
                ids.push(BRONZE_PICKAXE);
                amounts.push(1n);
            }

            if (gold === 0n) {
                ids.push(GOLD_COINS);
                amounts.push(ethers.parseEther("25"));
            }
            
            // High Level Bonus Check (XP >= 1600)
            if (miningXp >= 1600n && iPick === 0n) {
                console.log("   -> Granting Iron Pickaxe (High Mining Level)");
                // Check if we already added bronze pickaxe to mint list - don't mint both if we grant iron?
                // Actually, keeping bronze is fine as backup/collectible.
                ids.push(IRON_PICKAXE);
                amounts.push(1n);
            }

            if (woodcuttingXp >= 1600n && iAxe === 0n) {
                 console.log("   -> Granting Iron Axe (High Woodcutting Level)");
                 ids.push(IRON_AXE);
                 amounts.push(1n);
            }

            // Resource Restoration based on XP
            // Rule: 10 XP = 1 Resource (Conservative estimate)
            // Note: With Iron tools it's 100 XP = 10 Resources (same ratio).
            // So XP / 10 is generally safe.
            // However, if they sold resources, this might mint extra.
            // BUT users are complaining about missing items from migration.
            // If they sold them in V1, they shouldn't get them back.
            // But we can't check V1 sales history easily.
            // "reissue items according to their xp" -> User explicitly asked for this.
            
            const expectedOre = miningXp / 10n;
            const expectedLogs = woodcuttingXp / 10n;

            const currentOre = await ItemsV2.balanceOf(tba, IRON_ORE);
            const currentLogs = await ItemsV2.balanceOf(tba, OAK_LOG);
            
            // Only top up if SIGNIFICANTLY missing (e.g. > 10 diff) to avoid spamming txs for active players
            // Or if balance is 0 and expected is high.
            // Let's be generous for migration fix.
            
            if (expectedOre > currentOre) {
                const diff = expectedOre - currentOre;
                if (diff > 0n) {
                    console.log(`   -> Restoring ${diff} Iron Ore (XP: ${miningXp})...`);
                    ids.push(IRON_ORE);
                    amounts.push(diff);
                }
            }

            if (expectedLogs > currentLogs) {
                const diff = expectedLogs - currentLogs;
                if (diff > 0n) {
                    console.log(`   -> Restoring ${diff} Oak Logs (XP: ${woodcuttingXp})...`);
                    ids.push(OAK_LOG);
                    amounts.push(diff);
                }
            }

            // Execute Batch Mint if needed
            if (ids.length > 0) {
                console.log(`   -> Minting Batch of ${ids.length} types...`);
                await waitForNonceSync();
                const tx = await ItemsV2.mintBatch(tba, ids, amounts, "0x");
                await tx.wait();
                console.log("   -> Done!");
            } else {
                console.log("   -> OK.");
            }

        } catch (e) {
            console.error(`Error processing index ${i}:`, e);
        }
    }
    console.log("\nReissue complete!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
