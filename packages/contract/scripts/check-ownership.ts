import { ethers } from "hardhat";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses.json");
  
  const migrationAddress = addresses.SkillerMigration;
  console.log("Migration Contract:", migrationAddress);

  const SkillerProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
  const SkillerItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  
  const profileOwner = await SkillerProfileV2.owner();
  console.log("SkillerProfileV2 Owner:", profileOwner);
  
  const itemsOwner = await SkillerItemsV2.owner();
  console.log("SkillerItemsV2 Owner:", itemsOwner);

  if (profileOwner !== migrationAddress) {
    console.log("WARNING: Migration contract is NOT the owner of SkillerProfileV2");
  } else {
    console.log("SUCCESS: Migration contract owns SkillerProfileV2");
  }

  if (itemsOwner !== migrationAddress) {
    console.log("WARNING: Migration contract is NOT the owner of SkillerItemsV2");
  } else {
    console.log("SUCCESS: Migration contract owns SkillerItemsV2");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
