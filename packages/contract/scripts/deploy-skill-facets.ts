import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  // Adjust path to addresses-v2.json as needed. 
  // Script is in packages/contract/scripts, so ../../frontend/src/lib/addresses-v2.json is correct
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying Skill Facets with account:", deployer.address);
  
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

  // 1. Deploy Facets
  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("✓ WoodcuttingFacet deployed:", woodcuttingFacet.target);
  await waitForNonceSync();

  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("✓ MiningFacet deployed:", miningFacet.target);
  await waitForNonceSync();
  
  const CraftingFacet = await ethers.getContractFactory("CraftingFacet");
  const craftingFacet = await CraftingFacet.deploy();
  await craftingFacet.waitForDeployment();
  console.log("✓ CraftingFacet deployed:", craftingFacet.target);
  await waitForNonceSync();

  const StatsFacet = await ethers.getContractFactory("StatsFacet");
  const statsFacet = await StatsFacet.deploy();
  await statsFacet.waitForDeployment();
  console.log("✓ StatsFacet deployed:", statsFacet.target);
  await waitForNonceSync();

  // 2. Update Diamond
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  const getSelectors = (contract: any) => {
      return contract.interface.fragments
          .filter((f: any) => f.type === "function")
          .map((f: any) => f.selector);
  };

  const facets = [
      { name: "WoodcuttingFacet", address: woodcuttingFacet.target, selectors: getSelectors(WoodcuttingFacet) },
      { name: "MiningFacet", address: miningFacet.target, selectors: getSelectors(MiningFacet) },
      { name: "CraftingFacet", address: craftingFacet.target, selectors: getSelectors(CraftingFacet) },
      { name: "StatsFacet", address: statsFacet.target, selectors: getSelectors(StatsFacet) }
  ];

  for (const facet of facets) {
      console.log(`Updating ${facet.name}...`);
      const cut = {
          facetAddress: facet.address,
          action: 1, // Replace first
          functionSelectors: facet.selectors
      };

      try {
          const tx = await diamondCut.diamondCut([cut], ethers.ZeroAddress, "0x");
          await tx.wait();
          console.log(`  ✓ ${facet.name} Replaced`);
      } catch (e) {
          console.log(`  ⚠ Replace failed for ${facet.name}. Trying Add/Replace split...`);
          
          // Try Add for the whole batch.
          try {
              const cutAdd = { ...cut, action: 0 }; // Add
              const tx = await diamondCut.diamondCut([cutAdd], ethers.ZeroAddress, "0x");
              await tx.wait();
              console.log(`  ✓ ${facet.name} Added`);
          } catch (e2) {
              console.log(`  ❌ Add also failed. Trying granular update.`);
              // Try one by one
              for (const selector of facet.selectors) {
                  try {
                      // Try Replace
                      const tx = await diamondCut.diamondCut([{
                          facetAddress: facet.address,
                          action: 1,
                          functionSelectors: [selector]
                      }], ethers.ZeroAddress, "0x");
                      await tx.wait();
                      console.log(`    ✓ Replaced selector ${selector}`);
                  } catch (e3) {
                      // Try Add
                      try {
                          const tx = await diamondCut.diamondCut([{
                              facetAddress: facet.address,
                              action: 0,
                              functionSelectors: [selector]
                          }], ethers.ZeroAddress, "0x");
                          await tx.wait();
                          console.log(`    ✓ Added selector ${selector}`);
                      } catch (e4) {
                           console.log(`    ❌ Failed to update selector ${selector}`);
                      }
                  }
              }
              console.log(`  ✓ Granular update finished`);
          }
      }
      await waitForNonceSync();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

