import { ethers } from "hardhat";
import * as fs from "fs";
import addresses from "../../frontend/src/lib/addresses.json";

// Helper to process array in chunks
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

async function main() {
    console.log("Starting BATCH Reissue based on Scan Results...");

    const INPUT_FILE = "scan-results.json";
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: ${INPUT_FILE} not found.`);
        return;
    }

    const discrepancies = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
    console.log(`Loaded ${discrepancies.length} discrepancies to process.`);

    // Load addresses
    const BATCH_MINTER_ADDRESS = "0xabDbA6d8D8E6c821FB543c103883f1704CbE14cF"; // Or the new generic one if preferred, but sticking to existing if working, or deployment needed.
    // Wait, the user complained about "DOG SHIT CODE SENDING ONE AT A TIME". 
    // The previous batch code `run-batch-resync.ts` logic was flawed because it assumed calculation inside the contract.
    // The Generic Batch Minter I just created allows passing exact IDs and amounts.
    // Let's use the Generic one.
    
    // IMPORTANT: I need to know the address of the NEW Generic Batch Minter. 
    // Since I just wrote the deployment script, I assume the user will deploy it or I should deploy it first.
    // But let's assume I will deploy it in this run or separate.
    // Actually, let's look for the address if it exists or deploy it.
    
    // For now, I will write a script that uses the `SkillerItemsV2.mintBatch` directly if the deployer is minter, 
    // OR use a batch contract. 
    // Sending 1-by-1 tx is slow. `mintBatch` is for multiple items to ONE address.
    // To send to MULTIPLE addresses in ONE tx, we need a multicall or a custom batch contract.
    
    // My `SkillerGenericBatchMinter` (which I just wrote) does exactly that: loop over addresses and mint.
    
    // Let's update this script to:
    // 1. Deploy the Generic Batch Minter (or use existing if provided/hardcoded).
    // 2. Batch the discrepancies.
    // 3. Send batches.

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    // DEPLOYING Generic Batch Minter for this run
    console.log("Deploying Generic Batch Minter...");
    const Factory = await ethers.getContractFactory("SkillerGenericBatchMinter");
    const batchMinter = await Factory.deploy(addresses.SkillerItemsV2);
    await batchMinter.waitForDeployment();
    const batchMinterAddr = await batchMinter.getAddress();
    console.log(`Batch Minter deployed at: ${batchMinterAddr}`);

    // Grant Role
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    console.log("Granting minter role to Batch Contract...");
    await (await ItemsV2.setMinter(batchMinterAddr, true)).wait();
    console.log("Granted.");

    // PREPARE DATA
    const mintOps: any[] = [];
    
    for (const disc of discrepancies) {
        const amount = BigInt(disc.diff);
        if (amount > 0n) {
            mintOps.push({
                to: disc.tba,
                id: disc.itemId,
                amount: amount
            });
        }
    }

    console.log(`Prepared ${mintOps.length} mint operations.`);

    // BATCH EXECUTION
    const BATCH_SIZE = 100; // Safety limit for gas
    const chunks = chunkArray(mintOps, BATCH_SIZE);

    console.log(`Split into ${chunks.length} batches.`);

    for (let i = 0; i < chunks.length; i++) {
        console.log(`Sending Batch ${i + 1}/${chunks.length}...`);
        try {
            const tx = await batchMinter.mintBatch(chunks[i]);
            console.log(`   -> Tx: ${tx.hash}`);
            await tx.wait();
            console.log("   -> Confirmed.");
        } catch (e: any) {
            console.error(`   -> FAILED Batch ${i + 1}:`, e.message);
        }
    }

    console.log("Done.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });







