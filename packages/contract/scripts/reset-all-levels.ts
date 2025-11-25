import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying Updated VoidFacet (Batch Reset) and Wiping System...");
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

  // 2. Prepare Cuts (Add `resetAllVoidLevels`)
  const selectors = [];
  // @ts-ignore
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  // @ts-ignore
  const resetAllSelector = VoidFacet.interface.getFunction("resetAllVoidLevels").selector;
  
  // Helper to check if selector exists
  const loupe = await ethers.getContractAt("IDiamondLoupe", addresses.Diamond);
  let isExisting = false;
  try {
      const facetAddress = await loupe.facetAddress(resetAllSelector);
      if (facetAddress !== ethers.ZeroAddress) {
          isExisting = true;
      }
  } catch (e) {}
  
  const cuts = [];
  
  if (isExisting) {
      cuts.push({
          facetAddress: voidFacet.target,
          action: 1, // Replace all
          functionSelectors: selectors
      });
  } else {
      cuts.push({
          facetAddress: voidFacet.target,
          action: 0, // Add new
          functionSelectors: [resetAllSelector]
      });
      // Replace others to point to new facet
      const otherSelectors = selectors.filter(s => s !== resetAllSelector);
      cuts.push({
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
      const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
      // proceed anyway if cut failed due to "no changes" or similar, function might be there
  }

  await waitForNonceSync();

  // 4. Reset ALL Levels
  console.log("3. Resetting ALL Levels...");
  const voidContract = await ethers.getContractAt("VoidFacet", addresses.Diamond);
  
  // Get Total Supply
  const profile = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
  let totalSupply = 500; // Default cap
  try {
     // If totalSupply exists
     // @ts-ignore
     totalSupply = Number(await profile.totalSupply());
     console.log(`   Total Supply: ${totalSupply}`);
  } catch(e) {
      console.log("   Using default supply cap: 500");
  }
  
  // Batch reset in chunks of 100 to be safe on gas
  const batchSize = 100;
  for (let i = 0; i <= totalSupply; i += batchSize) {
      const end = Math.min(i + batchSize - 1, totalSupply + 50); // Go a bit over just in case
      console.log(`   Resetting ${i} to ${end}...`);
      try {
          const tx = await voidContract.resetAllVoidLevels(i, end);
          await tx.wait();
          console.log("     ✓ Batch Reset");
      } catch (e) {
          console.error("     ❌ Batch Failed:", e);
      }
      await waitForNonceSync(1000);
  }

  // 5. Reset Leaderboard Again
  try {
      console.log("4. Resetting Leaderboard...");
      const tx = await voidContract.resetLeaderboard();
      await tx.wait();
      console.log("   ✓ Leaderboard Reset Successful");
  } catch (e) {
      console.error("   ❌ Board Reset Failed:", e);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
