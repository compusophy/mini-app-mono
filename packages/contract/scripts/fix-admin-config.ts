import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  // Read from the CORRECTED addresses-v2.json
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Fixing Admin Config with account:", deployer.address);
  console.log("Diamond:", addresses.Diamond);
  console.log("Migration:", addresses.SkillerMigration);

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

  const Admin = await ethers.getContractAt("AdminFacet", addresses.Diamond);
  
  console.log("   Setting Migration Contract...");
  const tx = await Admin.setMigrationContract(addresses.SkillerMigration);
  await tx.wait();
  console.log("   ✓ Migration Contract set correctly");
  
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

