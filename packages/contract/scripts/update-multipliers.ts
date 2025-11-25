import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Updating Multipliers (Mining/Woodcutting) with account:", deployer.address);
  
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

  // 1. Deploy WoodcuttingFacet
  console.log("1. Deploying WoodcuttingFacet...");
  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("   ✓ WoodcuttingFacet deployed at:", woodcuttingFacet.target);

  await waitForNonceSync();

  // 2. Deploy MiningFacet
  console.log("2. Deploying MiningFacet...");
  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("   ✓ MiningFacet deployed at:", miningFacet.target);

  await waitForNonceSync();

  // 3. Cut Diamond
  console.log("3. Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  const woodSelectors = [];
  for (const fragment of WoodcuttingFacet.interface.fragments) {
      if (fragment.type === "function") {
          woodSelectors.push(fragment.selector);
      }
  }

  const mineSelectors = [];
  for (const fragment of MiningFacet.interface.fragments) {
      if (fragment.type === "function") {
          mineSelectors.push(fragment.selector);
      }
  }

  const cuts = [
      {
          facetAddress: woodcuttingFacet.target,
          action: 1, // Replace
          functionSelectors: woodSelectors
      },
      {
          facetAddress: miningFacet.target,
          action: 1, // Replace
          functionSelectors: mineSelectors
      }
  ];

  try {
      const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
  }

  console.log("   ✓ Multipliers Updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

