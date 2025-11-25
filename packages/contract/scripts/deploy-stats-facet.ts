import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  const StatsFacet = await ethers.getContractFactory("StatsFacet");
  const statsFacet = await StatsFacet.deploy();
  await statsFacet.waitForDeployment();
  console.log("✓ StatsFacet deployed at:", statsFacet.target);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  const diamondLoupe = await ethers.getContractAt("IDiamondLoupe", addresses.Diamond);
  
  const selectors = [];
  for (const fragment of StatsFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  // Manually check which selectors exist
  const existingSelectors = [];
  const nonExistingSelectors = [];
  
  for (const sel of selectors) {
      const facet = await diamondLoupe.facetAddress(sel);
      if (facet !== ethers.ZeroAddress) {
          existingSelectors.push(sel);
      } else {
          nonExistingSelectors.push(sel);
      }
  }
  
  const cuts = [];
  
  if (existingSelectors.length > 0) {
      cuts.push({
          facetAddress: statsFacet.target,
          action: 1, // Replace
          functionSelectors: existingSelectors
      });
  }
  
  if (nonExistingSelectors.length > 0) {
      cuts.push({
          facetAddress: statsFacet.target,
          action: 0, // Add
          functionSelectors: nonExistingSelectors
      });
  }

  if (cuts.length > 0) {
      console.log(`Updating with ${cuts.length} cuts...`);
      const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("✓ StatsFacet Updated Successfully");
  } else {
      console.log("No changes needed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
