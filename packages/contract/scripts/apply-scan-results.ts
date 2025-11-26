import { ethers } from "hardhat";
import * as fs from "fs";
import addresses from "../../frontend/src/lib/addresses.json";

const DELAY_MS = 2000; // 2 seconds delay
const INPUT_FILE = "scan-results.json";

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting Item Reissue based on Scan Results...");

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: ${INPUT_FILE} not found.`);
        return;
    }

    const discrepancies = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
    console.log(`Loaded ${discrepancies.length} discrepancies to process.`);

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const itemsAddr = addresses.SkillerItemsV2;
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", itemsAddr);

    // Ensure Deployer is Minter
    const isMinter = await ItemsV2.minters(deployer.address);
    if (!isMinter) {
        console.log("Deployer is not a minter. Granting minter role...");
        try {
            await (await ItemsV2.setMinter(deployer.address, true)).wait();
            console.log("Minter role granted.");
        } catch (e: any) {
            console.error("Failed to grant minter role:", e.message);
            return; // Cannot proceed without minter role
        }
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < discrepancies.length; i++) {
        const disc = discrepancies[i];
        console.log(`\n--- Processing ${i + 1}/${discrepancies.length} ---`);
        console.log(`Profile #${disc.tokenId} (TBA: ${disc.tba})`);
        console.log(`Item: ${disc.item} (ID: ${disc.itemId})`);
        console.log(`Missing: ${disc.diff} (Exp: ${disc.expected}, Cur: ${disc.current})`);

        try {
            const amount = BigInt(disc.diff);
            if (amount <= 0n) {
                console.log("   -> Amount is 0 or negative, skipping.");
                continue;
            }

            console.log(`   -> Minting ${amount} ${disc.item}...`);
            
            // Mint the difference
            const tx = await ItemsV2.mint(disc.tba, disc.itemId, amount, "0x");
            console.log(`      Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log("      Confirmed.");
            
            successCount++;

            // Nice delay to be gentle
            await sleep(DELAY_MS);

        } catch (e: any) {
            console.error(`      FAILED: ${e.message}`);
            failCount++;
        }
    }

    console.log("\nReissue Complete!");
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });




