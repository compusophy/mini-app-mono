import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Updating Facets with account:", deployer.address);
  
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

  // 1. Deploy AdminFacet (Updated with adminSetXP and proper checks)
  console.log("1. Deploying AdminFacet...");
  const AdminFacet = await ethers.getContractFactory("AdminFacet");
  const adminFacet = await AdminFacet.deploy();
  await adminFacet.waitForDeployment();
  console.log("   ✓ AdminFacet deployed at:", adminFacet.target);

  await waitForNonceSync();

  // 2. Deploy GameFacet (Updated with getXP/getStats)
  console.log("2. Deploying GameFacet...");
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("   ✓ GameFacet deployed at:", gameFacet.target);

  await waitForNonceSync();

  // 3. Cut Diamond
  console.log("3. Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // AdminFacet Selectors
  const adminSelectors = [];
  for (const fragment of AdminFacet.interface.fragments) {
      if (fragment.type === "function") {
          adminSelectors.push(fragment.selector);
      }
  }
  
  // GameFacet Selectors
  const gameSelectors = [];
  for (const fragment of GameFacet.interface.fragments) {
      if (fragment.type === "function") {
          gameSelectors.push(fragment.selector);
      }
  }

  // We are replacing existing facets. 
  // Note: `adminSetXP` is NEW (Add). `setGameConfig` is OLD (Replace).
  // `getXP`/`getStats` is NEW (Add). `createCharacter` is OLD (Replace).
  
  // It's safer to Remove all old selectors for these facets and Add new ones, OR split into Replace/Add.
  // Let's try Replace/Add strategy carefully.
  
  const adminReplace = adminSelectors.filter(s => 
      s === AdminFacet.interface.getFunction("setGameConfig").selector ||
      s === AdminFacet.interface.getFunction("setMigrationContract").selector
  );
  const adminAdd = adminSelectors.filter(s => !adminReplace.includes(s));

  const gameReplace = gameSelectors.filter(s => 
      s === GameFacet.interface.getFunction("createCharacter").selector ||
      s === GameFacet.interface.getFunction("claimStarterPickaxe").selector 
  );
  // Wait, claimStarterPickaxe was added in previous step. If it exists, it's Replace.
  // If the previous cut failed partially, it might be Add.
  // To be safe, I will Replace `createCharacter` and `claimStarterPickaxe` (assuming it exists now).
  // And Add `getXP`, `getStats`.
  
  const gameAdd = gameSelectors.filter(s => !gameReplace.includes(s));

  const cuts = [
      {
          facetAddress: adminFacet.target,
          action: 1, // Replace
          functionSelectors: adminReplace
      },
      {
          facetAddress: adminFacet.target,
          action: 0, // Add
          functionSelectors: adminAdd
      },
      {
          facetAddress: gameFacet.target,
          action: 1, // Replace
          functionSelectors: gameReplace
      },
      {
          facetAddress: gameFacet.target,
          action: 0, // Add
          functionSelectors: gameAdd
      }
  ];

  // Execute cuts one by one to isolate failures
  for (const cut of cuts) {
      if (cut.functionSelectors.length === 0) continue;
      console.log(`   Executing Cut (Action: ${cut.action}, Count: ${cut.functionSelectors.length})...`);
      try {
          const tx = await diamondCut.diamondCut([cut], ethers.ZeroAddress, "0x");
          await tx.wait();
          console.log("     ✓ Success");
      } catch (e) {
          console.log("     ⚠ Failed (likely 'Function not found' for Replace or 'Function exists' for Add). Trying inverse...");
          // Flip action and try again
          const newAction = cut.action === 0 ? 1 : 0;
          const newCut = { ...cut, action: newAction };
          try {
              const tx = await diamondCut.diamondCut([newCut], ethers.ZeroAddress, "0x");
              await tx.wait();
              console.log("     ✓ Success (Inverse action worked)");
          } catch (e2) {
              console.error("     ❌ Failed completely", e2.shortMessage || e2.message);
          }
      }
      await waitForNonceSync();
  }

  // 4. Configure AdminFacet
  console.log("4. Configuring AdminFacet...");
  // We need to set the Migration Contract address in the Diamond storage so `adminSetXP` allows it.
  const Admin = await ethers.getContractAt("AdminFacet", addresses.Diamond);
  const migrationAddr = addresses.SkillerMigration;
  
  console.log("   Setting Migration Contract:", migrationAddr);
  await Admin.setMigrationContract(migrationAddr);
  console.log("   ✓ Migration Contract set");

  console.log("   ✓ All updates complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

