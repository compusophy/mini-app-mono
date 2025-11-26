import { ethers } from "hardhat";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses.json");
  const ITEMS_ADDRESS = addresses.SkillerItemsV2; // Use V2 Items

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Generic Batch Minter with deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("SkillerGenericBatchMinter");
  const minter = await Factory.deploy(ITEMS_ADDRESS);
  await minter.waitForDeployment();

  console.log("SkillerGenericBatchMinter deployed to:", minter.target);
  
  console.log("Granting MINTER role to batch contract...");
  const items = await ethers.getContractAt("SkillerItemsV2", ITEMS_ADDRESS);
  const tx = await items.setMinter(minter.target, true);
  await tx.wait();
  
  console.log("Minter role granted. Ready for batch operations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});




