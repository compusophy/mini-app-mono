import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Deploying ShopFacet with account:", deployer.address);
  
  const ShopFacet = await ethers.getContractFactory("ShopFacet");
  const shopFacet = await ShopFacet.deploy();
  await shopFacet.waitForDeployment();
  console.log("✓ ShopFacet deployed at:", shopFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  // 1. Add ShopFacet Selectors
  const shopSelectors = [];
  for (const fragment of ShopFacet.interface.fragments) {
      if (fragment.type === "function") {
          shopSelectors.push(fragment.selector);
      }
  }
  
  const cutShop = [{
      facetAddress: shopFacet.target,
      action: 0, // Add
      functionSelectors: shopSelectors
  }];

    console.log("Adding ShopFacet...");
    try {
        const tx = await diamondCut.diamondCut(cutShop, ethers.ZeroAddress, "0x");
        await tx.wait();
        console.log("✓ ShopFacet Added");
    } catch (e: any) {
        // Hardhat error message handling for function already exists
        if (e.message.includes("Function already exists") || e.message.includes("LibDiamondCut: Can't add function that already exists")) {
            console.log("ShopFacet exists, trying Replace...");
            const cutReplace = [{
                facetAddress: shopFacet.target,
                action: 1, // Replace
                functionSelectors: shopSelectors
            }];
            const tx = await diamondCut.diamondCut(cutReplace, ethers.ZeroAddress, "0x");
            await tx.wait();
            console.log("✓ ShopFacet Replaced");
        } else {
            console.error("Error adding ShopFacet:", e.message);
        }
    }

  /*
  // 2. Update MiningFacet and WoodcuttingFacet
  console.log("Deploying updated Mining & Woodcutting Facets...");
  
  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("✓ MiningFacet deployed at:", miningFacet.target);

  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("✓ WoodcuttingFacet deployed at:", woodcuttingFacet.target);
  
  // Helper to get selectors (filtering out supportsInterface if needed, but Facets usually don't have it unless they inherit)
  // Note: Our Facets don't inherit ERC165 directly usually, check code.
  // MiningFacet and WoodcuttingFacet don't inherit standard interfaces in this codebase based on read files.
  
  const getSelectors = (contract: any) => {
      const sels = [];
      for (const fragment of contract.interface.fragments) {
          if (fragment.type === "function" && fragment.name !== "supportsInterface") {
              sels.push(fragment.selector);
          }
      }
      return sels;
  };

  const miningSelectors = getSelectors(MiningFacet);
  const woodcuttingSelectors = getSelectors(WoodcuttingFacet);

  const cutUpdate = [
      {
          facetAddress: miningFacet.target,
          action: 1, // Replace
          functionSelectors: miningSelectors
      },
      {
          facetAddress: woodcuttingFacet.target,
          action: 1, // Replace
          functionSelectors: woodcuttingSelectors
      }
  ];

  console.log("Updating Mining and Woodcutting Logic...");
  const tx2 = await diamondCut.diamondCut(cutUpdate, ethers.ZeroAddress, "0x");
  await tx2.wait();
  console.log("✓ Facets Updated");
  */
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

