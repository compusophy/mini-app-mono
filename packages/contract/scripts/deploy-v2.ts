import { ethers, upgrades } from "hardhat";
import { IDiamondCut } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying V2 contracts with account:", deployer.address);

  // Helper to wait for nonce sync and add extra buffer
  const waitForNonceSync = async (minWaitMs = 2000) => {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
      const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      
      if (pendingNonce === latestNonce) {
        // Add a small buffer wait to ensure RPC has fully updated
        await new Promise(resolve => setTimeout(resolve, minWaitMs));
        return pendingNonce;
      }
      
      console.log(`   ⏳ Waiting for nonce sync... (pending=${pendingNonce}, latest=${latestNonce})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    
    throw new Error("Nonce sync timeout - too many pending transactions");
  };

  // --- 1. Deploy UUPS Token Contracts ---
  await waitForNonceSync();
  console.log("\n1. Deploying SkillerProfileV2 (UUPS)...");
  const SkillerProfileV2 = await ethers.getContractFactory("SkillerProfileV2");
  // UUPS proxy deployment
  const profileV2 = await upgrades.deployProxy(SkillerProfileV2, [deployer.address], { 
    initializer: 'initialize', 
    kind: 'uups' 
  });
  await profileV2.waitForDeployment();
  console.log("   ✓ SkillerProfileV2 deployed at:", profileV2.target);

  await waitForNonceSync();
  console.log("Deploying SkillerItemsV2 (UUPS)...");
  const SkillerItemsV2 = await ethers.getContractFactory("SkillerItemsV2");
  const itemsV2 = await upgrades.deployProxy(SkillerItemsV2, [deployer.address], { 
    initializer: 'initialize', 
    kind: 'uups' 
  });
  await itemsV2.waitForDeployment();
  console.log("   ✓ SkillerItemsV2 deployed at:", itemsV2.target);

  // --- 2. Deploy Diamond Infrastructure ---
  await waitForNonceSync();
  console.log("\n2. Deploying Diamond...");
  // First, deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.waitForDeployment();
  console.log("   ✓ DiamondCutFacet deployed at:", diamondCutFacet.target);

  // Deploy Diamond
  await waitForNonceSync();
  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(deployer.address, diamondCutFacet.target);
  await diamond.waitForDeployment();
  console.log("   ✓ Diamond deployed at:", diamond.target);

  // --- 3. Deploy & Cut Facets ---
  await waitForNonceSync();
  console.log("\n3. Deploying Facets...");
  
  const FacetNames = [
    "DiamondLoupeFacet",
    "WoodcuttingFacet",
    "MiningFacet",
    "CraftingFacet",
    "AdminFacet"
  ];

  const cuts = [];

  for (const facetName of FacetNames) {
    await waitForNonceSync();
    const Facet = await ethers.getContractFactory(facetName);
    const facet = await Facet.deploy();
    await facet.waitForDeployment();
    console.log(`   ✓ ${facetName} deployed at: ${facet.target}`);

    // Get selectors
    const selectors = [];
    for (const fragment of Facet.interface.fragments) {
        if (fragment.type === "function") {
            selectors.push(fragment.selector);
        }
    }

    cuts.push({
      facetAddress: facet.target,
      action: 0, // Add
      functionSelectors: selectors
    });
  }

  // Perform Diamond Cut
  await waitForNonceSync();
  console.log("   Performing Diamond Cut...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamond.target);
  await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
  console.log("   ✓ Diamond Cut complete");

  // --- 4. Configure Game State ---
  console.log("\n4. Configuring Game State...");
  
  // Existing addresses from V1
  const V1_REGISTRY = "0xd88ff2769292646d65c3a8e9dbcbf341564f76f7";
  const V1_ACCOUNT_IMPL = "0x7539d350b54fa05aa221ec2c541c5509230d4abc";
  const V1_PROFILE = "0x49e8f6ae8829c59fff4c1f14363b8fc9f048892d";
  const V1_ITEMS = "0xaa00c50ccb85226c854d1f50019d973d9e5d5c61";

  // We reuse the Registry and AccountImpl from V1
  const registryAddress = V1_REGISTRY;
  const accountImplAddress = V1_ACCOUNT_IMPL;
  
  console.log("   Using existing Registry:", registryAddress);
  console.log("   Using existing AccountImpl:", accountImplAddress);

  // Configure Admin Facet
  // We need to call setGameConfig on the Diamond
  await waitForNonceSync();
  const adminFacet = await ethers.getContractAt("AdminFacet", diamond.target);
  await adminFacet.setGameConfig(
    itemsV2.target,
    profileV2.target,
    registryAddress,
    accountImplAddress
  );
  console.log("   ✓ Game Config set on Diamond");

  // --- 5. Deploy Descriptor ---
  await waitForNonceSync();
  console.log("\n5. Deploying Descriptor V2...");
  const DescriptorV2 = await ethers.getContractFactory("SkillerDescriptorV2");
  const descriptorV2 = await DescriptorV2.deploy();
  await descriptorV2.waitForDeployment();
  console.log("   ✓ SkillerDescriptorV2 deployed at:", descriptorV2.target);

  // Configure Profile to use Descriptor
  await waitForNonceSync();
  await profileV2.setConfig(
    itemsV2.target,
    registryAddress,
    accountImplAddress,
    descriptorV2.target
  );
  console.log("   ✓ SkillerProfileV2 configured");

  // --- 6. Grant Roles ---
  await waitForNonceSync();
  console.log("\n6. Granting Roles...");
  // Diamond needs Minter role on ItemsV2
  await itemsV2.setMinter(diamond.target, true);
  console.log("   ✓ Minter role granted to Diamond");

  // --- 7. Deploy Migration Contract ---
  await waitForNonceSync();
  console.log("\n7. Deploying SkillerMigration...");
  const Migration = await ethers.getContractFactory("SkillerMigration");
  const migration = await Migration.deploy(
    V1_PROFILE,
    V1_ITEMS,
    registryAddress,
    accountImplAddress,
    profileV2.target,
    itemsV2.target,
    deployer.address
  );
  await migration.waitForDeployment();
  console.log("   ✓ SkillerMigration deployed at:", migration.target);
  
  // Grant Minter Role to Migration contract so it can mint V2 items
  await waitForNonceSync();
  await itemsV2.setMinter(migration.target, true);
  console.log("   ✓ SkillerItemsV2 Minter role granted to Migration");

  // Transfer Ownership of ProfileV2 to Migration so it can mint specific IDs
  await waitForNonceSync();
  await profileV2.transferOwnership(migration.target);
  console.log("   ✓ SkillerProfileV2 ownership transferred to Migration");

  console.log("\n--- V2 Deployment Complete ---");
  console.log({
    SkillerProfileV2: profileV2.target,
    SkillerItemsV2: itemsV2.target,
    Diamond: diamond.target,
    SkillerDescriptorV2: descriptorV2.target,
    SkillerMigration: migration.target
  });
  
  // Write addresses to file
  const fs = require("fs");
  const path = require("path");
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
  fs.writeFileSync(addressesPath, JSON.stringify({
    SkillerProfileV2: profileV2.target,
    SkillerItemsV2: itemsV2.target,
    Diamond: diamond.target,
    SkillerDescriptorV2: descriptorV2.target,
    SkillerMigration: migration.target,
    ERC6551Registry: registryAddress,
    ERC6551Account: accountImplAddress
  }, null, 2));
  console.log(`\n✓ Addresses written to ${addressesPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

