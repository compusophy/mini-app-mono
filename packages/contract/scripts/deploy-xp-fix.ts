import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Updating AdminFacet & Migration with account:", deployer.address);
  
  // Helper to wait for nonce sync
  const waitForNonceSync = async (minWaitMs = 2000) => {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
      const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      
      if (pendingNonce === latestNonce) {
        await new Promise(resolve => setTimeout(resolve, minWaitMs));
        return pendingNonce;
      }
      
      console.log(`   ⏳ Waiting for nonce sync... (pending=${pendingNonce}, latest=${latestNonce})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    throw new Error("Nonce sync timeout");
  };

  await waitForNonceSync();

  // 1. Deploy Updated AdminFacet
  console.log("1. Deploying Updated AdminFacet...");
  const AdminFacet = await ethers.getContractFactory("AdminFacet");
  const adminFacet = await AdminFacet.deploy();
  await adminFacet.waitForDeployment();
  console.log("   ✓ AdminFacet deployed at:", adminFacet.target);

  // Cut Diamond (Replace AdminFacet functions + Add new ones)
  const selectors = [];
  for (const fragment of AdminFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }
  
  // We need to check what exists. `setGameConfig` exists. `adminSetXP` is new. `setMigrationContract` is new.
  const setConfigSel = AdminFacet.interface.getFunction("setGameConfig").selector;
  
  const cutReplace = [{
      facetAddress: adminFacet.target,
      action: 1, // Replace
      functionSelectors: [setConfigSel]
  }];
  
  const cutAdd = [{
      facetAddress: adminFacet.target,
      action: 0, // Add
      functionSelectors: selectors.filter(s => s !== setConfigSel)
  }];

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  try {
      await diamondCut.diamondCut(cutReplace, ethers.ZeroAddress, "0x");
      console.log("   ✓ AdminFacet Replace complete");
  } catch (e) {
      console.log("   ⚠ Replace failed (maybe didn't exist?). Trying Add for all.");
      try {
        await diamondCut.diamondCut([{
            facetAddress: adminFacet.target,
            action: 0, // Add
            functionSelectors: selectors
        }], ethers.ZeroAddress, "0x");
      } catch(e2) {}
  }
  
  await waitForNonceSync();
  
  try {
      await diamondCut.diamondCut(cutAdd, ethers.ZeroAddress, "0x");
      console.log("   ✓ AdminFacet Add complete");
  } catch (e) {
      console.log("   ⚠ Add failed (maybe already exists?)");
  }

  await waitForNonceSync();

  // 2. Redeploy SkillerMigration (with XP support)
  console.log("2. Redeploying SkillerMigration...");
  const oldProfile = "0x49e8f6ae8829c59fff4c1f14363b8fc9f048892d";
  const oldItems = "0xaa00c50ccb85226c854d1f50019d973d9e5d5c61";
  const registry = "0xd88ff2769292646d65c3a8e9dbcbf341564f76f7";
  const accountImpl = "0x7539d350b54fa05aa221ec2c541c5509230d4abc";
  
  // Old XP Addresses
  const oldMining = "0x792a1809d0e49d5dda18cfab6b95afae646ed56d";
  const oldWoodcutting = "0xcc7c9077cfdae601cb38161800316b62857845d0";

  const SkillerMigration = await ethers.getContractFactory("SkillerMigration");
  const migration = await SkillerMigration.deploy(
    oldProfile,
    oldItems,
    registry,
    accountImpl,
    addresses.SkillerProfileV2,
    addresses.SkillerItemsV2,
    addresses.Diamond, // Pass Diamond
    oldMining,
    oldWoodcutting,
    deployer.address
  );
  await migration.waitForDeployment();
  console.log("   ✓ SkillerMigration redeployed at:", migration.target);
  
  // Update addresses.json manually or log it
  addresses.SkillerMigration = migration.target;
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(path.join(__dirname, "../../frontend/src/lib/addresses-v2.json"), JSON.stringify(addresses, null, 2));
  fs.writeFileSync(path.join(__dirname, "../../frontend/src/lib/addresses.json"), JSON.stringify(addresses, null, 2));

  await waitForNonceSync();

  // 3. Set Migration Contract in Diamond
  console.log("3. Authorizing Migration Contract in Diamond...");
  const admin = await ethers.getContractAt("AdminFacet", addresses.Diamond);
  await admin.setMigrationContract(migration.target);
  console.log("   ✓ Migration Contract Authorized");

  // 4. Re-setup Permissions (since Migration address changed)
  console.log("4. Re-setting Permissions...");
  const profileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  
  // Profile owner might be the OLD migration contract or Deployer
  let profileOwner = await profileV2.owner();
  if (profileOwner !== migration.target) {
      console.log("   ProfileV2 owned by:", profileOwner);
      // Try to recover if we own the old migration contract
      // But we need the OLD migration address. It was in addresses.json before we overwrote it?
      // It was 0x207A6F6c54De8527496C5461b9AbB4D85D530052
      const oldMigrationAddr = "0x207A6F6c54De8527496C5461b9AbB4D85D530052";
      
      if (profileOwner === oldMigrationAddr) {
          try {
              const oldMig = await ethers.getContractAt("SkillerMigration", oldMigrationAddr);
              await oldMig.recoverOwnership(addresses.SkillerProfileV2, deployer.address);
              console.log("   ✓ Recovered ProfileV2 to Deployer");
              await waitForNonceSync();
              await profileV2.transferOwnership(migration.target);
              console.log("   ✓ Transferred ProfileV2 to New Migration");
          } catch(e) {
              console.log("   ❌ Failed to recover ProfileV2");
          }
      } else if (profileOwner === deployer.address) {
          await profileV2.transferOwnership(migration.target);
          console.log("   ✓ Transferred ProfileV2 to New Migration");
      }
  }
  
  // Items Minter
  await itemsV2.setMinter(migration.target, true);
  console.log("   ✓ Granted Minter to New Migration");

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

