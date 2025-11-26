import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Deploying Gold Charm Update with account:", deployer.address);
  
  // 1. Deploy QuestFacet
  const QuestFacet = await ethers.getContractFactory("QuestFacet");
  const questFacet = await QuestFacet.deploy();
  await questFacet.waitForDeployment();
  console.log("✓ QuestFacet deployed at:", questFacet.target);

  // 2. Deploy ShopFacet
  const ShopFacet = await ethers.getContractFactory("ShopFacet");
  const shopFacet = await ShopFacet.deploy();
  await shopFacet.waitForDeployment();
  console.log("✓ ShopFacet deployed at:", shopFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  // 3. Prepare Cuts
  const cuts = [];

  // QuestFacet Selectors (Replace)
  const questSelectors = [];
  for (const fragment of QuestFacet.interface.fragments) {
      if (fragment.type === "function" && fragment.name !== "supportsInterface") {
          questSelectors.push(fragment.selector);
      }
  }
  cuts.push({
      facetAddress: questFacet.target,
      action: 1, // Replace
      functionSelectors: questSelectors
  });

  // ShopFacet Selectors (Replace)
  const shopSelectors = [];
  for (const fragment of ShopFacet.interface.fragments) {
      if (fragment.type === "function") {
          shopSelectors.push(fragment.selector);
      }
  }
  cuts.push({
      facetAddress: shopFacet.target,
      action: 1, // Replace
      functionSelectors: shopSelectors
  });
  
  console.log("Cutting Diamond with new facets...");
  const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ Diamond Updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

