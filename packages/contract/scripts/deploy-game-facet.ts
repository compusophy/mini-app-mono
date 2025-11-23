import { ethers } from "hardhat";
import { IDiamondCut } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  const DIAMOND_ADDRESS = addresses.Diamond;

  console.log("Deploying GameFacet with account:", deployer.address);
  console.log("Diamond Address:", DIAMOND_ADDRESS);

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

  // 1. Deploy GameFacet
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("   ✓ GameFacet deployed at:", gameFacet.target);

  await waitForNonceSync();

  // 2. Cut Diamond
  const selectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  const cut = [{
    facetAddress: gameFacet.target,
    action: 0, // Add
    functionSelectors: selectors
  }];

  console.log("   Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", DIAMOND_ADDRESS);
  await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  console.log("   ✓ Diamond Cut complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

