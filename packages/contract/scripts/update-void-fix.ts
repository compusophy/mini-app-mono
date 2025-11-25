import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying Updated VoidFacet (Retry) with account:", deployer.address);
  
  // Reuse existing deployment if possible, or redeploy
  // Let's assume we need to redeploy or use the one we just did.
  // Ideally we would pass the address, but for safety let's redeploy to be sure.
  
  const VoidFacet = await ethers.getContractFactory("VoidFacet");
  const voidFacet = await VoidFacet.deploy();
  await voidFacet.waitForDeployment();
  console.log("   ✓ VoidFacet deployed at:", voidFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  const selectors = [];
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  // The error was "Can't replace function that doesn't exist".
  // This likely means `sacrificeToVoid(uint256)` is NEW because the signature changed (removed bool).
  // And the OLD one `sacrificeToVoid(uint256,bool)` still exists and needs to be REMOVED.
  
  // Strategy:
  // 1. Remove OLD selectors that are gone.
  // 2. Add NEW selectors.
  // 3. Replace EXISTING selectors that stayed same.

  // Since I don't have the OLD interface loaded easily, I will try to:
  // 1. Add the new one `sacrificeToVoid(uint256)`.
  // 2. Replace `getVoidCost` and `getVoidLevel`, `getLeaderboard` (signatures same).
  // 3. If possible, remove the old one, but if I don't know its selector, I might leave it (it just won't work well or will be dead code).
  // Actually, I can compute the old selector manually: `sacrificeToVoid(uint256,bool)`.
  
  const oldSelector = ethers.id("sacrificeToVoid(uint256,bool)").slice(0, 10);
  const newSelector = ethers.id("sacrificeToVoid(uint256)").slice(0, 10);
  
  console.log(`   Old Selector: ${oldSelector}`);
  console.log(`   New Selector: ${newSelector}`);

  const cuts = [];

  // 1. Remove Old
  cuts.push({
      facetAddress: ethers.ZeroAddress,
      action: 2, // Remove
      functionSelectors: [oldSelector]
  });

  // 2. Add New
  cuts.push({
      facetAddress: voidFacet.target,
      action: 0, // Add
      functionSelectors: [newSelector]
  });

  // 3. Replace Common
  const commonSelectors = selectors.filter(s => s !== newSelector);
  if (commonSelectors.length > 0) {
      cuts.push({
          facetAddress: voidFacet.target,
          action: 1, // Replace
          functionSelectors: commonSelectors
      });
  }

  try {
      const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful (Remove Old, Add New, Replace Common)");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

