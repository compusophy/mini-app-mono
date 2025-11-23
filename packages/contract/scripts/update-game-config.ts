import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  const oldAddresses = require("../../frontend/src/lib/addresses.json");
  
  console.log("Updating Game Config with NEW ERC6551Account implementation...");
  
  const Diamond = await ethers.getContractAt("AdminFacet", addresses.Diamond);

  // Existing config values (to preserve them)
  const items = addresses.SkillerItemsV2;
  const profile = addresses.SkillerProfileV2;
  const registry = addresses.ERC6551Registry;
  const accountImpl = addresses.ERC6551Account; // This is the NEW one from addresses-v2.json

  console.log("Configuring Diamond with:");
  console.log("Items:", items);
  console.log("Profile:", profile);
  console.log("Registry:", registry);
  console.log("Account Impl:", accountImpl);

  const tx = await Diamond.setGameConfig(items, profile, registry, accountImpl);
  await tx.wait();
  
  console.log("✓ Game Config updated!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
