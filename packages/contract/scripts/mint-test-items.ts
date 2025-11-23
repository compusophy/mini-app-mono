import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses.json");
  
  console.log("Minting Test Items with account:", deployer.address);
  
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  const registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
  
  // Get TBA for Skiller #1
  const tba = await registry.account(
      addresses.ERC6551Account,
      0,
      8453, // Base Mainnet ChainID
      addresses.SkillerProfileV2,
      1 // Token ID 1
  );
  
  console.log("Skiller #1 TBA:", tba);

  // Check if deployer is minter
  const isMinter = await itemsV2.minters(deployer.address);
  const owner = await itemsV2.owner();
  
  if (deployer.address !== owner && !isMinter) {
      console.log("⚠ Deployer is not a minter or owner. Attempting to proceed anyway (maybe owner logic handles it)...");
  }

  // Mint 200 Oak Logs (201)
  console.log("Minting 200 Oak Logs...");
  const tx1 = await itemsV2.mint(tba, 201, 200, "0x");
  await tx1.wait();
  console.log("✓ Minted 200 Oak Logs");

  // Mint 200 Iron Ore (301)
  console.log("Minting 200 Iron Ore...");
  const tx2 = await itemsV2.mint(tba, 301, 200, "0x");
  await tx2.wait();
  console.log("✓ Minted 200 Iron Ore");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

