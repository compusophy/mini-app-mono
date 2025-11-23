import { ethers } from "hardhat";
// import addresses from "../../packages/frontend/src/lib/addresses-v2.json";

const addresses = {
  "SkillerProfileV2": "0xbECD4F7B2e0435A0494CefAB3474255eA1f5712a",
  "SkillerItemsV2": "0xe25008892D32d28Fd7f25C00AB2aA55056731C0A",
  "Diamond": "0xCe3d9618a559A76bBF1A6289dc1224FF9662E24D",
  "SkillerDescriptorV2": "0xeF916b10e43A5A3F76bCB09a6Cf5dEaa2cBFA599",
  "SkillerMigration": "0x207A6F6c54De8527496C5461b9AbB4D85D530052",
  "ERC6551Registry": "0xd88ff2769292646d65c3a8e9dbcbf341564f76f7",
  "ERC6551Account": "0xDDe5f3F759046aFc9aF971453DF663A3ba6D5b9e"
};

async function main() {
  const tokenId = 49;
  const [deployer] = await ethers.getSigners();
  console.log("Checking migration for Token ID:", tokenId);

  // Contracts
  const registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  const profileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);

  // Account Implementations
  const IMPL_V1_BROKEN = "0x7539d350b54fa05aa221ec2c541c5509230d4abc"; // Used by current Migration
  const IMPL_V2_FIXED = addresses.ERC6551Account; // "0xDDe5..." Used by Frontend

  console.log("Impl V1 (Used by Migration):", IMPL_V1_BROKEN);
  console.log("Impl V2 (Used by Frontend): ", IMPL_V2_FIXED);

  // Calculate TBAs
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  const tbaV1 = await registry.account(
    IMPL_V1_BROKEN,
    0,
    chainId,
    addresses.SkillerProfileV2,
    tokenId
  );

  const tbaV2 = await registry.account(
    IMPL_V2_FIXED,
    0,
    chainId,
    addresses.SkillerProfileV2,
    tokenId
  );

  console.log("\nTBA V1 (Where items likely went):", tbaV1);
  console.log("TBA V2 (Where frontend looks):   ", tbaV2);

  // Check Balances
  const itemIds = [101, 151, 201, 301, 1];
  const itemNames = ["Bronze Axe", "Bronze Pickaxe", "Oak Log", "Iron Ore", "Gold"];

  console.log("\n--- Balances at TBA V1 (Migration Target) ---");
  for (let i = 0; i < itemIds.length; i++) {
    const bal = await itemsV2.balanceOf(tbaV1, itemIds[i]);
    console.log(`${itemNames[i]} (${itemIds[i]}): ${bal}`);
  }

  console.log("\n--- Balances at TBA V2 (Frontend Target) ---");
  for (let i = 0; i < itemIds.length; i++) {
    const bal = await itemsV2.balanceOf(tbaV2, itemIds[i]);
    console.log(`${itemNames[i]} (${itemIds[i]}): ${bal}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

