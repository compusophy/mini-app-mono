import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying GameFacet Update with account:", deployer.address);
  
  const waitForNonceSync = async (minWaitMs = 2000) => {
    let attempts = 0;
    while (attempts < 10) {
      const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
      const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      if (pendingNonce === latestNonce) {
        await new Promise(resolve => setTimeout(resolve, minWaitMs));
        return;
      }
      console.log(`   ⏳ Waiting for nonce sync... (p=${pendingNonce}, l=${latestNonce})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
  };

  await waitForNonceSync();

  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("✓ GameFacet deployed at:", gameFacet.target);

  await waitForNonceSync();

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  const selectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  const cutReplace = [{
      facetAddress: gameFacet.target,
      action: 1, // Replace
      functionSelectors: selectors.filter(s => s !== GameFacet.interface.getFunction("getXP").selector)
  }];
  
  // Add getXP separately as it's new
  const cutAdd = [{
      facetAddress: gameFacet.target,
      action: 0, // Add
      functionSelectors: [GameFacet.interface.getFunction("getXP").selector]
  }];

  console.log("Cutting Diamond...");
  try {
      await diamondCut.diamondCut(cutReplace, ethers.ZeroAddress, "0x");
      console.log("✓ GameFacet Replace complete");
  } catch (e) {
      console.log("⚠ Replace failed. Trying Add All.");
      // If replace failed, maybe try adding all?
      try {
        await diamondCut.diamondCut([{
            facetAddress: gameFacet.target,
            action: 0,
            functionSelectors: selectors
        }], ethers.ZeroAddress, "0x");
        console.log("✓ GameFacet Add All complete");
      } catch(e2) {}
  }

  await waitForNonceSync();
  
  try {
      await diamondCut.diamondCut(cutAdd, ethers.ZeroAddress, "0x");
      console.log("✓ GameFacet Add complete (getXP)");
  } catch(e) {
       console.log("⚠ Add failed (maybe already exists)");
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

