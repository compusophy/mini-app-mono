import { ethers } from "hardhat";

// Data structure for resync
interface ResyncData {
  to: string;
  woodXp: bigint;
  miningXp: bigint;
}

async function main() {
  const BATCH_MINTER_ADDRESS = "0xabDbA6d8D8E6c821FB543c103883f1704CbE14cF";
  
  // Fetch data logic from reissue-items.ts logic?
  // Or assume we have a list.
  // Since I don't have the database or easy access to V1 XP states here in this script without calling the chain,
  // I will need to pull the V2 accounts and their stats.
  
  // But the user said "resyncing items... giving everyone starter gold and 2 axes... then resources to match what they had to resync".
  // "According to their XP".
  
  // Logic:
  // 1. Get all V2 Profiles (using Enumerable or just ID scan)
  // 2. For each Profile:
  //    - Get XP from GameDiamond
  //    - Get TBA address
  // 3. Construct batch
  // 4. Send batch
  
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  const PROFILE_ADDRESS = addresses.SkillerProfileV2;
  const DIAMOND_ADDRESS = addresses.Diamond;
  const ACCOUNT_IMPL = addresses.ERC6551Account;
  const REGISTRY_ADDRESS = addresses.ERC6551Registry;

  const profile = await ethers.getContractAt("SkillerProfileV2", PROFILE_ADDRESS);
  const diamond = await ethers.getContractAt("GameFacet", DIAMOND_ADDRESS); // For getStats
  const registry = await ethers.getContractAt("ERC6551Registry", REGISTRY_ADDRESS);
  const minter = await ethers.getContractAt("SkillerBatchMinter", BATCH_MINTER_ADDRESS);

  console.log("Scanning V2 Profiles...");
  const total = await profile.totalSupply();
  console.log(`Total V2 Profiles: ${total}`);
  
  const batchData: ResyncData[] = [];
  const batchSize = 50; // 50 accounts per tx
  
  const chainId = (await ethers.provider.getNetwork()).chainId;

  for (let i = 0n; i < total; i++) {
      try {
        const tokenId = await profile.tokenByIndex(i);
        // Get XP
        const stats = await diamond.getStats(tokenId); // [miningXp, woodcuttingXp]
        const miningXp = stats[0];
        const woodXp = stats[1];
        
        // Get TBA
        // Note: We must use the SAME salt/params as creation to find the right TBA.
        // Default was salt 0.
        const tba = await registry.account(ACCOUNT_IMPL, 0n, chainId, PROFILE_ADDRESS, tokenId);
        
        batchData.push({
            to: tba,
            woodXp: woodXp,
            miningXp: miningXp
        });
        
        if (batchData.length % 10 === 0) process.stdout.write(".");

      } catch (e) {
          console.error(`Error reading index ${i}:`, e);
      }
  }
  
  console.log(`\nPrepared ${batchData.length} accounts for resync.`);
  
  // Execute in chunks
  for (let i = 0; i < batchData.length; i += batchSize) {
      const chunk = batchData.slice(i, i + batchSize);
      console.log(`Sending Batch ${i / batchSize + 1} (${chunk.length} accounts)...`);
      
      try {
          const tx = await minter.resyncBatch(chunk);
          console.log(`Tx Sent: ${tx.hash}`);
          await tx.wait();
          console.log("Confirmed.");
      } catch (e) {
          console.error("Batch failed:", e);
      }
  }
  
  console.log("All Done!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

