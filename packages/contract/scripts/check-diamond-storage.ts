import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const addresses = require("../../frontend/src/lib/addresses.json");
  const diamondAddress = addresses.Diamond;

  console.log("Checking Diamond Storage at:", diamondAddress);

  // We can't easily read struct storage directly with getStorageAt unless we know the layout perfectly.
  // But we can check if we have a getter? 
  // LibGame storage is at keccak256("skiller.game.storage")
  
  const position = ethers.keccak256(ethers.toUtf8Bytes("skiller.game.storage"));
  console.log("Storage Slot:", position);

  // Read slot 0 (items), slot 1 (profile), slot 2 (registry)
  // Slot is 32 bytes.
  
  const itemsSlot = await ethers.provider.getStorage(diamondAddress, position);
  console.log("Items (Slot 0):", itemsSlot);
  
  // To get next slots, we need to increment the BigInt position
  const posBigInt = BigInt(position);
  
  const profileSlot = await ethers.provider.getStorage(diamondAddress, posBigInt + 1n);
  console.log("Profile (Slot 1):", profileSlot);
  
  // Expected Addresses
  console.log("Expected Items:", addresses.SkillerItemsV2);
  console.log("Expected Profile:", addresses.SkillerProfileV2);
  
  // Check if they match (padded)
  const itemsPadded = ethers.zeroPadValue(addresses.SkillerItemsV2, 32).toLowerCase();
  if (itemsSlot.toLowerCase() === itemsPadded) {
      console.log("✅ Items Address matches!");
  } else {
      console.log("❌ Items Address MISMATCH or NOT SET!");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

