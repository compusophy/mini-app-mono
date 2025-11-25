import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Debugging Leaderboard State...");
  console.log("Diamond:", addresses.Diamond);
  
  const voidContract = await ethers.getContractAt("VoidFacet", addresses.Diamond);
  
  // 1. Check Skiller #32 Level
  try {
      const level32 = await voidContract.getVoidLevel(32);
      console.log(`   🔍 Skiller #32 Void Level: ${level32}`);
  } catch (e) {
      console.error("   ❌ Failed to get level 32:", e);
  }

  // 2. Check Leaderboard
  try {
      const board = await voidContract.getLeaderboard();
      console.log("   🔍 Current Leaderboard (Top 5):");
      for (let i = 0; i < 5; i++) {
          if (board[i].level > 0n) {
              console.log(`      #${i+1}: Skiller #${board[i].tokenId} - Level ${board[i].level}`);
          }
      }
  } catch (e) {
      console.error("   ❌ Failed to get leaderboard:", e);
  }

  // 3. Force Reset Skiller #32 Level AGAIN
  try {
      console.log("   Checking resetVoidLevel selector...");
      // Just try calling it. If it fails, we know why.
      const tx = await voidContract.resetVoidLevel(32);
      await tx.wait();
      console.log("   ✓ resetVoidLevel(32) called successfully");
      
      // Check again
      const newLevel32 = await voidContract.getVoidLevel(32);
      console.log(`   🔍 Skiller #32 Void Level AFTER reset: ${newLevel32}`);
  } catch (e) {
      console.log("   ⚠️ resetVoidLevel failed (maybe not on contract?):", e.message.slice(0, 100));
      
      // If it failed, it might be because the previous cut failed silently or didn't apply?
      // We saw "Diamond Cut Successful" though.
      // Maybe we are hitting the WRONG contract address?
  }

  // 4. Force Reset Leaderboard AGAIN
  try {
      const tx = await voidContract.resetLeaderboard();
      await tx.wait();
      console.log("   ✓ resetLeaderboard() called successfully");
      
       // Check again
      const board = await voidContract.getLeaderboard();
      console.log("   🔍 Leaderboard AFTER reset (Top 1):");
      console.log(`      #1: Skiller #${board[0].tokenId} - Level ${board[0].level}`);
      
  } catch (e) {
      console.error("   ❌ resetLeaderboard failed:", e);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

