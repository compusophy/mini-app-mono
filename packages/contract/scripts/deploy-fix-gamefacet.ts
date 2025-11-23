import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
  const addresses = require(addressesPath);

  console.log("Deploying GameFacet Fix with account:", deployer.address);
  
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

  // 3. Update GameFacet (claimStarterPickaxe)
  console.log("3. Updating GameFacet...");
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("   ✓ GameFacet redeployed at:", gameFacet.target);

  // Cut Diamond
  const selectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  const cut = [{
    facetAddress: gameFacet.target,
    action: 1, // Replace (Since createCharacter exists)
    functionSelectors: selectors.filter(s => s === GameFacet.interface.getFunction("createCharacter").selector)
  }, {
      facetAddress: gameFacet.target,
      action: 0, // Add (claimStarterPickaxe)
      functionSelectors: selectors.filter(s => s !== GameFacet.interface.getFunction("createCharacter").selector)
  }];

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  try {
      await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
      console.log("   ✓ Diamond Cut complete");
  } catch (e) {
      console.log("   ⚠ Diamond Cut failed. Maybe functions already exist?");
      console.error(e);
  }
  
  console.log("   ✓ GameFacet Fix Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

