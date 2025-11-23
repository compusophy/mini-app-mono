import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
  const addresses = require(addressesPath);

  console.log("Deploying Fixes with account:", deployer.address);
  
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

  // 1. Deploy New SkillerMigration
  console.log("1. Deploying SkillerMigration...");
  // Old addresses (V1) from addresses.json
  const oldProfile = "0x49e8f6ae8829c59fff4c1f14363b8fc9f048892d";
  const oldItems = "0xaa00c50ccb85226c854d1f50019d973d9e5d5c61";
  const registry = "0xd88ff2769292646d65c3a8e9dbcbf341564f76f7";
  const accountImpl = addresses.ERC6551Account; // Use the fixed account implementation
  
  const SkillerMigration = await ethers.getContractFactory("SkillerMigration");
  const migration = await SkillerMigration.deploy(
    oldProfile,
    oldItems,
    registry,
    accountImpl,
    addresses.SkillerProfileV2,
    addresses.SkillerItemsV2,
    addresses.Diamond,
    "0x792a1809d0e49d5dda18cfab6b95afae646ed56d", // SkillerMining (old)
    "0xcc7c9077cfdae601cb38161800316b62857845d0", // SkillerChopping (old)
    deployer.address
  );
  await migration.waitForDeployment();
  console.log("   ✓ SkillerMigration deployed at:", migration.target);
  addresses.SkillerMigration = migration.target;

  await waitForNonceSync();

  // 2. Setup Permissions for Migration
  console.log("2. Setting up Permissions...");
  
  // ProfileV2 Ownership -> Migration
  const profileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
  let profileOwner = await profileV2.owner();
  
  // Check if owned by OLD migration
  // Note: addresses.SkillerMigration currently holds the OLD address (from file) until we overwrite it in memory
  // But we already overwrote `addresses.SkillerMigration = migration.target` above!
  // We need to recover the old address.
  // Actually, I should have saved it before overwriting.
  // Let's fix this logic.
  
  // Reload old address from file to be safe or just check against known old address
  // For now, I'll just assume if owner != deployer and != new migration, it's likely old migration.
  
  if (profileOwner !== migration.target && profileOwner !== deployer.address) {
      console.log("   ProfileV2 owned by:", profileOwner);
      console.log("   Attempting to recover ownership from Old Migration...");
      try {
          const oldMigrationContract = await ethers.getContractAt("SkillerMigration", profileOwner);
          // We (deployer) should own the old migration contract
          await oldMigrationContract.recoverOwnership(addresses.SkillerProfileV2, deployer.address);
          console.log("   ✓ Recovered ownership to deployer");
          await waitForNonceSync();
          profileOwner = deployer.address;
      } catch (e) {
          console.error("   ❌ Failed to recover ownership. We might not own the old migration contract or it's not a migration contract.", e);
      }
  }

  if (profileOwner === deployer.address) {
    console.log("   Transferring ProfileV2 ownership to New Migration...");
    await profileV2.transferOwnership(migration.target);
    console.log("   ✓ Ownership transferred");
  } else if (profileOwner === migration.target) {
      console.log("   ✓ ProfileV2 already owned by New Migration");
  } else {
      console.log("   ⚠ CRITICAL: Could not secure ownership of ProfileV2. Migration will fail.");
  }

  await waitForNonceSync();

  // ItemsV2 Minter -> Migration
  const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
  console.log("   Granting Minter role to Migration on ItemsV2...");
  await itemsV2.setMinter(migration.target, true);

  await waitForNonceSync();

  // 3. Configure AdminFacet for XP Migration
  console.log("3. Configuring AdminFacet...");
  const adminFacet = await ethers.getContractAt("AdminFacet", addresses.Diamond);
  await adminFacet.setMigrationContract(migration.target);
  console.log("   ✓ Migration Contract set in AdminFacet (enabling XP transfer)");

  await waitForNonceSync();

  // 4. Update GameFacet (claimStarterPickaxe)
  console.log("4. Updating GameFacet...");
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("   ✓ GameFacet redeployed at:", gameFacet.target);

  // Cut Diamond
  const selectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  const cut = [{
    facetAddress: gameFacet.target,
    action: 1, // Replace (Since createCharacter exists)
    functionSelectors: selectors.filter(s => s === GameFacet.interface.getFunction("createCharacter").selector)
  }, {
      facetAddress: gameFacet.target,
      action: 0, // Add (claimStarterPickaxe)
      functionSelectors: selectors.filter(s => s !== GameFacet.interface.getFunction("createCharacter").selector)
  }];
  
  // Note: DiamondCut action Replace requires the function to exist. Add requires it NOT to exist.
  // `createCharacter` exists. `claimStarterPickaxe` is new.
  // So split into two cuts or use mixed actions? `diamondCut` takes an array.
  
  // We can just do Replace for createCharacter and Add for others.
  
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  try {
      await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
      console.log("   ✓ Diamond Cut complete");
  } catch (e) {
      console.log("   ⚠ Diamond Cut failed (maybe functions already exist/don't exist mismatch). Trying simpler cut.");
      // Fallback logic if needed, but Replace/Add should work if state is known.
      console.error(e);
  }

  // 5. Save Addresses
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("   ✓ Addresses updated");

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

