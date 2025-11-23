import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses.json");
  
  console.log("Checking permissions with account:", deployer.address);
  
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  const diamondAddress = addresses.Diamond;

  // Check if Diamond is minter
  const isMinter = await itemsV2.minters(diamondAddress);
  console.log(`Is Diamond (${diamondAddress}) a minter?`, isMinter);

  if (!isMinter) {
      console.log("Granting Minter role to Diamond...");
      const tx = await itemsV2.setMinter(diamondAddress, true);
      await tx.wait();
      console.log("✓ Minter role granted");
  } else {
      console.log("✓ Diamond is already a minter");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

