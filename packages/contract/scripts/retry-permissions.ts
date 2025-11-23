import { ethers } from "hardhat";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  const ITEMS_ADDRESS = addresses.SkillerItemsV2;
  const MINTER_ADDRESS = "0xabDbA6d8D8E6c821FB543c103883f1704CbE14cF";

  console.log("Retrying granting MINTER role to:", MINTER_ADDRESS);
  const items = await ethers.getContractAt("SkillerItemsV2", ITEMS_ADDRESS);
  
  // Bump gas price
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ? feeData.gasPrice * 150n / 100n : undefined; // +50%

  const tx = await items.setMinter(MINTER_ADDRESS, true, { gasPrice });
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  
  console.log("Minter role granted.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
