import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Deploying QuestFacet with account:", deployer.address);
  
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
  
  console.log("Adding selectors:", selectors);

  const cut = [{
      facetAddress: questFacet.target,
      action: 0, // Add
      functionSelectors: selectors
  }];

  console.log("Cutting Diamond...");
  try {
      const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("✓ QuestFacet Added");
  } catch (e: any) {
      console.log("Error adding QuestFacet:", e.message);
      // Check if it's because selector exists (maybe I deployed it before?)
      // If so, try replace
      if (e.message.includes("Function already exists")) {
          console.log("Trying Replace...");
           const cutReplace = [{
              facetAddress: questFacet.target,
              action: 1, // Replace
              functionSelectors: selectors
          }];
          const tx = await diamondCut.diamondCut(cutReplace, ethers.ZeroAddress, "0x");
          await tx.wait();
          console.log("✓ QuestFacet Replaced");
      } else {
          throw e;
      }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

