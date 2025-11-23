import { ethers } from "hardhat";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  const ITEMS_ADDRESS = addresses.SkillerItemsV2;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Batch Minter with deployer:", deployer.address);

  const SkillerBatchMinter = await ethers.getContractFactory("SkillerBatchMinter");
  const minter = await SkillerBatchMinter.deploy(ITEMS_ADDRESS);
  await minter.waitForDeployment();

  console.log("SkillerBatchMinter deployed to:", minter.target);
  
  console.log("Granting MINTER role to batch contract...");
  // Note: SkillerItemsV2 uses setMinter(address, bool)
  const items = await ethers.getContractAt("SkillerItemsV2", ITEMS_ADDRESS);
  const tx = await items.setMinter(minter.target, true);
  await tx.wait();
  
  console.log("Minter role granted. Ready for batch operations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

