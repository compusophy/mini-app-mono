import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Debugging and Wiping Specific Skiller IDs...");
  
  const voidContract = await ethers.getContractAt("VoidFacet", addresses.Diamond);
  
  // IDs to check and wipe
  const targetIds = [32, 185, 1]; 
  
  for (const id of targetIds) {
      const level = await voidContract.getVoidLevel(id);
      console.log(`   Skiller #${id} Level: ${level}`);
      
      if (level > 0) {
          console.log(`   Resetting #${id}...`);
          try {
              const tx = await voidContract.resetVoidLevel(id);
              await tx.wait();
              console.log(`   ✓ Reset #${id}`);
          } catch (e) {
              console.error(`   ❌ Failed to reset #${id}:`, e);
          }
      }
  }
  
  // Deploy Updated VoidFacet with Hardened Reset
  console.log("Deploying Hardened VoidFacet...");
  const VoidFacet = await ethers.getContractFactory("VoidFacet");
  const voidFacet = await VoidFacet.deploy();
  await voidFacet.waitForDeployment();
  console.log("   ✓ VoidFacet deployed at:", voidFacet.target);
  
  // Prepare Cut (Replace resetLeaderboard)
  // We need to replace ALL selectors to be safe and ensure we use the new contract
  const selectors = [];
  // @ts-ignore
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  const cut = {
      facetAddress: voidFacet.target,
      action: 1, // Replace
      functionSelectors: selectors
  };
  
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  console.log("Cutting Diamond...");
  try {
      // @ts-ignore
      const tx = await diamondCut.diamondCut([cut], ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Cut Failed:", e);
  }
  
  // Run Hardened Reset
  console.log("Running Hardened Leaderboard Reset...");
  try {
      const tx = await voidContract.resetLeaderboard();
      await tx.wait();
      console.log("   ✓ Leaderboard Deep Wiped");
  } catch (e) {
      console.error("   ❌ Reset Failed:", e);
  }
  
  // Check Board
  const board = await voidContract.getLeaderboard();
  console.log("   Leaderboard Check (Top 3):");
  for (let i = 0; i < 3; i++) {
      console.log(`   #${i+1}: Skiller #${board[i].tokenId} - Level ${board[i].level}`);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

