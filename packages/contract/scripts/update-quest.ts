import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Updating QuestFacet (50 logs/ore) with account:", deployer.address);
  
  const QuestFacet = await ethers.getContractFactory("QuestFacet");
  const questFacet = await QuestFacet.deploy();
  await questFacet.waitForDeployment();
  console.log("✓ QuestFacet deployed at:", questFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  const selectors = [];
  for (const fragment of QuestFacet.interface.fragments) {
      if (fragment.type === "function" && fragment.name !== "supportsInterface") {
          selectors.push(fragment.selector);
      }
  }
  
  console.log("Replacing selectors:", selectors);

  const cut = [{
      facetAddress: questFacet.target,
      action: 1, // Replace
      functionSelectors: selectors
  }];

  console.log("Cutting Diamond...");
  const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ QuestFacet Updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
