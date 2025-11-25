import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying Updated VoidFacet (with resetVoidLevel) and fixing Skiller #32...");
  console.log("Deployer:", deployer.address);
  console.log("Diamond:", addresses.Diamond);
  
  const waitForNonceSync = async (minWaitMs = 2000) => {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
      const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      if (pendingNonce === latestNonce) {
        await new Promise(resolve => setTimeout(resolve, minWaitMs));
        return pendingNonce;
      }
      console.log(`   ⏳ Waiting for nonce sync... (pending=${pendingNonce}, latest=${latestNonce})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    throw new Error("Nonce sync timeout");
  };

  await waitForNonceSync();

  // 1. Deploy Updated VoidFacet
  console.log("1. Deploying VoidFacet...");
  const VoidFacet = await ethers.getContractFactory("VoidFacet");
  const voidFacet = await VoidFacet.deploy();
  await voidFacet.waitForDeployment();
  console.log("   ✓ VoidFacet deployed at:", voidFacet.target);

  await waitForNonceSync();

  // 2. Prepare Cuts
  const selectors = [];
  // @ts-ignore
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  // @ts-ignore
  const resetLevelSelector = VoidFacet.interface.getFunction("resetVoidLevel").selector;
  
  // If `resetVoidLevel` already exists on the Diamond, we should treat it as REPLACE, not ADD.
  // But checking on-chain is slow/complex in script.
  // If previous run failed, maybe it was PARTIALLY successful?
  // Or if it failed because "Can't add function that already exists", it means `resetVoidLevel` IS already there.
  // So we should try to just REPLACE ALL selectors.
  
  const cuts = [
      {
          facetAddress: voidFacet.target,
          action: 1, // Replace (Update ALL functions to point to new facet)
          functionSelectors: selectors
      }
  ];
  
  // NOTE: If `resetVoidLevel` was NOT added yet, Replace will fail if it tries to replace a non-existent selector?
  // "LibDiamondCut: Can't replace function that doesn't exist"
  // So we have to be precise.
  
  // Let's try a safer approach: remove `resetVoidLevel` from selectors list for Replace, and try to Add it separately?
  // But if it WAS added, Add will fail.
  // Best way: Check if selector exists on Diamond.
  const diamondContract = await ethers.getContractAt("Diamond", addresses.Diamond);
  // Does Diamond have `facets()`? Or `facetFunctionSelectors(address)`?
  // Standard DiamondLoupeFacet: `facets()`, `facetFunctionSelectors(address)`, `facetAddresses()`, `facetAddress(bytes4)`
  const loupe = await ethers.getContractAt("IDiamondLoupe", addresses.Diamond);
  
  let isResetLevelExisting = false;
  try {
      const facetAddress = await loupe.facetAddress(resetLevelSelector);
      if (facetAddress !== ethers.ZeroAddress) {
          isResetLevelExisting = true;
      }
  } catch (e) {
      console.log("   ⚠️ Could not check selector existence (assuming new if error not strictly related to view call)");
  }
  
  console.log(`   Selector resetVoidLevel exists? ${isResetLevelExisting}`);

  const finalCuts = [];
  
  if (isResetLevelExisting) {
      // If it exists, we replace EVERYTHING including it.
      finalCuts.push({
          facetAddress: voidFacet.target,
          action: 1, // Replace
          functionSelectors: selectors
      });
  } else {
      // If it does NOT exist:
      // 1. Add resetVoidLevel
      finalCuts.push({
          facetAddress: voidFacet.target,
          action: 0, // Add
          functionSelectors: [resetLevelSelector]
      });
      // 2. Replace others
      const otherSelectors = selectors.filter(s => s !== resetLevelSelector);
      finalCuts.push({
          facetAddress: voidFacet.target,
          action: 1, // Replace
          functionSelectors: otherSelectors
      });
  }

  // 3. Cut Diamond
  console.log("2. Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  try {
      // @ts-ignore
      const tx = await diamondCut.diamondCut(finalCuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
      // Continue to try fixes even if cut failed (maybe logic is already there?)
  }

  await waitForNonceSync();

  // 4. Fix Skiller #32 and Reset Board Again
  console.log("3. Fixing Skiller #32 and Resetting Board...");
  const voidContract = await ethers.getContractAt("VoidFacet", addresses.Diamond);
  
  // Reset Level for 32
  try {
      console.log("   Resetting Skiller #32 level...");
      const tx = await voidContract.resetVoidLevel(32);
      await tx.wait();
      console.log("   ✓ Skiller #32 Level Reset");
  } catch (e) {
      console.error("   ❌ Level Reset Failed:", e);
  }

  await waitForNonceSync();

  // Reset Leaderboard
  try {
      console.log("   Resetting Leaderboard...");
      const tx = await voidContract.resetLeaderboard();
      await tx.wait();
      console.log("   ✓ Leaderboard Reset Successful");
  } catch (e) {
      console.error("   ❌ Board Reset Failed:", e);
  }
  
  // 5. Grant Oak Logs to Skiller #1
    console.log("4. Granting Oak Logs to Skiller #1...");
    const items = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    const tba = await registry.account(
        addresses.ERC6551Account,
        0,
        8453,
        addresses.SkillerProfileV2,
        1
    );
    
    console.log("   Skiller #1 TBA:", tba);
    
    try {
        // Grant 2000 Oak Logs (ID 201)
        // We need Minter role. Deployer should have it.
        const tx = await items.mint(tba, 201, 2000, "0x");
        await tx.wait();
        
        // Grant 2000 Iron Ore (ID 301)
        const tx2 = await items.mint(tba, 301, 2000, "0x");
        await tx2.wait();

        console.log("   ✓ Granted 2000 Oak Logs & Iron Ore to Skiller #1");
    } catch (e) {
        console.error("   ❌ Grant Failed:", e);
    }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
