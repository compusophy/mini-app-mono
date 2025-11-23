import { ethers } from "hardhat";
import * as fs from "fs";
import addresses from "../../frontend/src/lib/addresses.json";

const DELAY_MS = 2000; // 2 seconds delay
const OUTPUT_FILE = "scan-results.json";

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting V2 Item Sync SCAN based on XP...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const diamondAddr = addresses.Diamond;
    const itemsAddr = addresses.SkillerItemsV2;
    const profileAddr = addresses.SkillerProfileV2;
    const accountImplementation = addresses.ERC6551Account;
    const registryAddr = addresses.ERC6551Registry;

    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    // Contracts
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", profileAddr);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", itemsAddr);
    const GameDiamond = await ethers.getContractAt("GameFacet", diamondAddr);
    const Registry = await ethers.getContractAt("IERC6551Registry", registryAddr);

    // Minter check removed as we are only scanning

    const totalProfiles = await ProfileV2.totalSupply();
    console.log(`Total V2 Profiles: ${totalProfiles}`);

    const discrepancies: any[] = [];
    
    // Clear previous file if exists
    if (fs.existsSync(OUTPUT_FILE)) {
        fs.unlinkSync(OUTPUT_FILE);
    }

    for (let i = 0; i < totalProfiles; i++) {
        try {
            const tokenId = await ProfileV2.tokenByIndex(i);
            console.log(`\n--- Checking Profile #${tokenId} (${i + 1}/${totalProfiles}) ---`);

            // Get V2 TBA
            const tba = await Registry.account(
                accountImplementation,
                0,
                chainId,
                profileAddr,
                tokenId
            );
            // console.log(`TBA: ${tba}`);

            // Get XP Stats
            let miningXp = 0n;
            let woodcuttingXp = 0n;
            try {
                const stats = await GameDiamond.getStats(tokenId);
                miningXp = stats[0];
                woodcuttingXp = stats[1];
            } catch (e) {
                console.log(`Could not read stats for #${tokenId}, skipping...`);
                continue;
            }

            // Calculate Expected Items
            const expectedIronOre = miningXp / 10n;
            const expectedOakLogs = woodcuttingXp / 10n;

            // Check Current Balances
            // 201 = Oak Logs, 301 = Iron Ore
            const currentOakLogs = await ItemsV2.balanceOf(tba, 201);
            const currentIronOre = await ItemsV2.balanceOf(tba, 301);

            let hasMismatch = false;

            // Check Iron Ore
            if (expectedIronOre > currentIronOre) {
                const diff = expectedIronOre - currentIronOre;
                console.log(`   -> Iron Ore Mismatch! XP: ${miningXp} (Exp: ${expectedIronOre}), Has: ${currentIronOre}`);
                console.log(`   -> Needs ${diff} Iron Ore`);
                
                discrepancies.push({
                    tokenId: tokenId.toString(),
                    tba: tba,
                    item: "Iron Ore",
                    itemId: 301,
                    expected: expectedIronOre.toString(),
                    current: currentIronOre.toString(),
                    diff: diff.toString()
                });
                hasMismatch = true;
            }

            // Check Oak Logs
            if (expectedOakLogs > currentOakLogs) {
                const diff = expectedOakLogs - currentOakLogs;
                console.log(`   -> Oak Logs Mismatch! XP: ${woodcuttingXp} (Exp: ${expectedOakLogs}), Has: ${currentOakLogs}`);
                console.log(`   -> Needs ${diff} Oak Logs`);
                
                discrepancies.push({
                    tokenId: tokenId.toString(),
                    tba: tba,
                    item: "Oak Logs",
                    itemId: 201,
                    expected: expectedOakLogs.toString(),
                    current: currentOakLogs.toString(),
                    diff: diff.toString()
                });
                hasMismatch = true;
            }

            if (!hasMismatch) {
                console.log("   -> In Sync.");
            } else {
                // Save to file as we go
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(discrepancies, null, 2));
                console.log(`   -> Saved to ${OUTPUT_FILE}`);
            }

            // Nice delay
            await sleep(DELAY_MS);

        } catch (e: any) {
            console.error(`Error processing index ${i}:`, e.message);
        }
    }

    console.log("\nScan Complete!");
    console.log(`Found ${discrepancies.length} discrepancies.`);
    console.log(`Results saved to ${OUTPUT_FILE}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
