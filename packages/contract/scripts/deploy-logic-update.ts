import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying Logic Updates with account:", deployer.address);
  
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

  // 1. Deploy WoodcuttingFacet
  console.log("Deploying WoodcuttingFacet...");
  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("✓ WoodcuttingFacet deployed at:", woodcuttingFacet.target);

  await waitForNonceSync();

  // 2. Deploy MiningFacet
  console.log("Deploying MiningFacet...");
  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("✓ MiningFacet deployed at:", miningFacet.target);

  await waitForNonceSync();

  // 3. Diamond Cut (Replace Functions)
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // Helper to get selectors
  const getSelectors = (contractInterface) => {
      const selectors = [];
      for (const fragment of contractInterface.fragments) {
          if (fragment.type === "function") {
              selectors.push(fragment.selector);
          }
      }
      return selectors;
  };

  const woodSelectors = getSelectors(WoodcuttingFacet.interface);
  const miningSelectors = getSelectors(MiningFacet.interface);

  const cut = [
      {
          facetAddress: woodcuttingFacet.target,
          action: 1, // Replace
          functionSelectors: woodSelectors
      },
      {
          facetAddress: miningFacet.target,
          action: 1, // Replace
          functionSelectors: miningSelectors
      }
  ];

  console.log("Cutting Diamond...");
  try {
      const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("✓ Diamond Logic Updated");
  } catch(e) {
      console.log("⚠ Replace failed (maybe didn't exist?). Trying Add.");
       const cutAdd = [
          {
              facetAddress: woodcuttingFacet.target,
              action: 0, // Add
              functionSelectors: woodSelectors
          },
          {
              facetAddress: miningFacet.target,
              action: 0, // Add
              functionSelectors: miningSelectors
          }
      ];
      await diamondCut.diamondCut(cutAdd, ethers.ZeroAddress, "0x");
      console.log("✓ Diamond Logic Added");
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

