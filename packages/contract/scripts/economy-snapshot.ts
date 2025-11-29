import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses.json");
  
  // Connect to contracts
  // StatsFacet is on the Diamond
  const stats = await ethers.getContractAt("StatsFacet", addresses.Diamond);
  const items = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  const registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
  
  console.log("Starting Economy Snapshot...");
  console.log("This may take a moment...");

  const snapshot = {
      timestamp: new Date().toISOString(),
      totalGold: 0n,
      totalWood: 0n,
      totalOre: 0n,
      players: [] as any[]
  };

  // Iterate ~1500 players (adjust if needed)
  const maxPlayers = 1500; 
  
  // Helper to get TBA address
  const getTBA = async (tokenId: number) => {
      try {
          return await registry.account(
              addresses.ERC6551Account,
              0, // salt
              8453, // chainId
              addresses.SkillerProfileV2,
              tokenId
          );
      } catch {
          return ethers.ZeroAddress;
      }
  };

  for(let i = 1; i <= maxPlayers; i++) {
      if (i % 50 === 0) console.log(`Processed ${i} profiles...`);
      
      // Get Stats
      // Returns (miningXp, miningLevel, woodcuttingXp, woodcuttingLevel)
      try {
          // We can check if player exists by seeing if stats return 0? 
          // Or just assume sequential IDs exist up to a point. 
          // If getStats reverts, we stop? No, it shouldn't revert.
          const s = await stats.getStats(i);
          
          // Only process if they have some XP (meaning they played) OR if we just want to check inventory
          // But to check inventory we need TBA address.
          
          const tba = await getTBA(i);
          
          // Get Balances
          // We can do a batch balance check if the contract supports it, but standard ERC1155 balanceOfBatch 
          // takes (accounts[], ids[]). We have 1 account, multiple IDs.
          // So we call balanceOfBatch([tba, tba, tba], [1, 201, 301])
          
          const balances = await items.balanceOfBatch(
              [tba, tba, tba],
              [1, 201, 301] // Gold, Oak Logs, Iron Ore
          );
          
          const gold = balances[0];
          const wood = balances[1];
          const ore = balances[2];
          
          snapshot.totalGold += gold;
          snapshot.totalWood += wood;
          snapshot.totalOre += ore;
          
          if (gold > 0n || wood > 0n || ore > 0n || s.miningXp > 0n || s.woodcuttingXp > 0n) {
              snapshot.players.push({
                  id: i,
                  tba: tba,
                  mining: { level: Number(s.miningLevel), xp: Number(s.miningXp) },
                  woodcutting: { level: Number(s.woodcuttingLevel), xp: Number(s.woodcuttingXp) },
                  balance: {
                      gold: Number(gold / 10n**18n), // Format nicely
                      wood: Number(wood),
                      ore: Number(ore)
                  }
              });
          }
      } catch (e) {
          // Likely end of minted tokens or RPC error
          // console.log(`Error at ID ${i}:`, e);
          // If we hit a streak of errors, maybe stop? 
          // For now, just continue, it might be a burned token.
      }
  }
  
  // Sort Leaderboards
  snapshot.players.sort((a, b) => (b.mining.xp + b.woodcutting.xp) - (a.mining.xp + a.woodcutting.xp));
  
  const report = {
      summary: {
          timestamp: snapshot.timestamp,
          totalPlayersActive: snapshot.players.length,
          economy: {
              gold: Number(snapshot.totalGold / 10n**18n),
              wood: Number(snapshot.totalWood),
              ore: Number(snapshot.totalOre)
          }
      },
      top10_overall: snapshot.players.slice(0, 10),
      top10_rich: [...snapshot.players].sort((a,b) => b.balance.gold - a.balance.gold).slice(0, 10)
  };
  
  const outputPath = path.join(__dirname, "../../report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nSnapshot Complete! Saved to ${outputPath}`);
  console.log("Summary:", report.summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});







