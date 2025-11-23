import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
  const addresses = require(addressesPath);
  const [deployer] = await ethers.getSigners();
  
  const tokenId = 49;
  console.log(`Fixing User #${tokenId} with account:`, deployer.address);

  const registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  const profileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);

  const IMPL_V2 = addresses.ERC6551Account; // The fixed implementation
  
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  // Calculate Target TBA (V2)
  const tbaV2 = await registry.account(
    IMPL_V2,
    0,
    chainId,
    addresses.SkillerProfileV2,
    tokenId
  );
  console.log("Target TBA (V2):", tbaV2);

  // Items to mint
  // Bronze Axe (101), Bronze Pickaxe (151), Gold (1)
  const mints = [
      { id: 101, amount: 1, name: "Bronze Axe" },
      { id: 151, amount: 1, name: "Bronze Pickaxe" },
      { id: 1, amount: ethers.parseEther("25"), name: "Gold" }
  ];

  for (const item of mints) {
      const bal = await itemsV2.balanceOf(tbaV2, item.id);
      if (bal == 0n) {
          console.log(`Minting ${item.name}...`);
          const tx = await itemsV2.mint(tbaV2, item.id, item.amount, "0x");
          await tx.wait();
          console.log(`   ✓ Minted ${item.name}`);
      } else {
          console.log(`   ✓ Already has ${item.name}`);
      }
  }
  
  console.log("User #49 Fix Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

