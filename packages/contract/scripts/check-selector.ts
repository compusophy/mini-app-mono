import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses.json");
  const diamondAddress = addresses.Diamond;
  
  console.log("Checking selector 0xf23a6e61 (onERC1155Received) on Diamond:", diamondAddress);
  
  const loupe = await ethers.getContractAt("IDiamondLoupe", diamondAddress);
  const facet = await loupe.facetAddress("0xf23a6e61");
  
  console.log("Facet Address:", facet);
  
  // Check if it matches QuestFacet
  // I don't know the QuestFacet address easily unless I deploy it again or check history, 
  // but I can check if it has code.
  
  if (facet === ethers.ZeroAddress) {
      console.log("❌ Selector NOT FOUND on Diamond!");
  } else {
      console.log("✅ Selector FOUND at:", facet);
      const code = await ethers.provider.getCode(facet);
      console.log("Code length:", code.length);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

