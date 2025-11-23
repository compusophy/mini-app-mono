import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Retrying Diamond Cut with account:", deployer.address);
  
  // Helper to wait for nonce sync
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

  // Redeploy GameFacet just to be sure we have the artifact/address
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("   ✓ GameFacet deployed at:", gameFacet.target);

  await waitForNonceSync();

  const selectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  // createCharacter (0x...)
  // claimStarterPickaxe (0x...)
  
  const createCharSel = GameFacet.interface.getFunction("createCharacter").selector;
  
  // Cut 1: Replace createCharacter
  const cut1 = [{
    facetAddress: gameFacet.target,
    action: 1, // Replace
    functionSelectors: [createCharSel]
  }];

  // Cut 2: Add claimStarterPickaxe
  const cut2 = [{
      facetAddress: gameFacet.target,
      action: 0, // Add
      functionSelectors: selectors.filter(s => s !== createCharSel)
  }];

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  console.log("   Executing Cut 1 (Replace)...");
  try {
    await diamondCut.diamondCut(cut1, ethers.ZeroAddress, "0x");
    console.log("   ✓ Cut 1 complete");
  } catch (e) {
      console.log("   ⚠ Cut 1 failed (maybe function doesn't exist to replace? trying Add)");
       // If Replace fails, maybe it didn't exist? Try Add.
       const cut1Add = [{
            facetAddress: gameFacet.target,
            action: 0, // Add
            functionSelectors: [createCharSel]
        }];
        try {
            await diamondCut.diamondCut(cut1Add, ethers.ZeroAddress, "0x");
            console.log("   ✓ Cut 1 (Add) complete");
        } catch(e2) {
            console.error("   ❌ Cut 1 failed completely", e2);
        }
  }
  
  await waitForNonceSync();

  console.log("   Executing Cut 2 (Add)...");
  try {
    await diamondCut.diamondCut(cut2, ethers.ZeroAddress, "0x");
    console.log("   ✓ Cut 2 complete");
  } catch (e) {
      console.error("   ❌ Cut 2 failed", e);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

