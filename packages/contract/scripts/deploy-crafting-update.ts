import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");

  console.log("Deploying CraftingFacet Update with account:", deployer.address);

  // 1. Deploy New Facet
  const CraftingFacet = await ethers.getContractFactory("CraftingFacet");
  const craftingFacet = await CraftingFacet.deploy();
  await craftingFacet.waitForDeployment();
  console.log("✓ CraftingFacet deployed at:", craftingFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // 2. Calculate New Selectors
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
  console.log("New Selectors:", newSelectors);

  // 3. Define Old Selectors to Remove
  const oldSignatures = [
      "smeltIron(uint256,uint256)",
      "smeltSteel(uint256,uint256)",
      "craftIronAxe(uint256)",
      "craftIronPickaxe(uint256)",
      "craftSteelAxe(uint256)",
      "craftSteelPickaxe(uint256)"
  ];
  
  const oldSelectors = oldSignatures.map(sig => ethers.id(sig).slice(0, 10));
  console.log("Old Selectors to Remove:", oldSelectors);

  // 4. Execute Cut
  const cut = [
      {
          facetAddress: ethers.ZeroAddress, // Address 0 for Remove
          action: 2, // Remove
          functionSelectors: oldSelectors
      },
      {
          facetAddress: craftingFacet.target,
          action: 0, // Add
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

