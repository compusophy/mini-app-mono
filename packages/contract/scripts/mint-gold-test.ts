import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses.json");
  
  console.log("Minting Gold with account:", deployer.address);
  
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

  // Mint 10000 Gold Coins (ID 1)
  // Gold has 18 decimals
  const amount = 10000n * 10n**18n;
  console.log("Minting 10,000 Gold Coins...");
  
  const tx = await itemsV2.mint(tba, 1, amount, "0x");
  await tx.wait();
  console.log("✓ Minted 10,000 Gold Coins");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

