import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");

  console.log("Deploying CraftingFacet Update (Removal of Smelting) with account:", deployer.address);

  // 1. Deploy New Facet (No Smelting)
  const CraftingFacet = await ethers.getContractFactory("CraftingFacet");
  const craftingFacet = await CraftingFacet.deploy();
  await craftingFacet.waitForDeployment();
  console.log("✓ CraftingFacet deployed at:", craftingFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // 2. Calculate New Selectors (Only Crafting)
  const getSelectors = (contract: any) => {
      const sels = [];
      for (const fragment of contract.interface.fragments) {
          if (fragment.type === "function" && fragment.name !== "supportsInterface") {
              sels.push(fragment.selector);
          }
      }
      return sels;
  };
  const newSelectors = getSelectors(CraftingFacet);
  console.log("New Selectors (Crafting Only):", newSelectors);

  // 3. Define Selectors to Remove (Smelting)
  // These are the signatures we added in the LAST update (with version)
  const smeltingSignatures = [
      "smeltIron(uint256,uint256,uint256)",
      "smeltSteel(uint256,uint256,uint256)"
  ];
  
  const removeSelectors = smeltingSignatures.map(sig => ethers.id(sig).slice(0, 10));
  console.log("Selectors to Remove (Smelting):", removeSelectors);

  // 4. Execute Cut
  // We perform TWO actions:
  // A. Replace the Crafting functions (same signature, new address)
  // B. Remove the Smelting functions
  
  // NOTE: `newSelectors` contains the craft functions. We want to REPLACE them.
  
  const cut = [
      /*
      {
          facetAddress: ethers.ZeroAddress, // Remove
          action: 2, // Remove
          functionSelectors: removeSelectors
      },
      */
      {
          facetAddress: craftingFacet.target,
          action: 1, // Replace (Update address for existing selectors)
          functionSelectors: newSelectors
      }
  ];

  console.log("Cutting Diamond...");
  const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ Diamond Cut Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
