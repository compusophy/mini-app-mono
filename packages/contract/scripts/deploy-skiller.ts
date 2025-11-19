import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  
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

  // 1. Deploy Registry
  await waitForNonceSync();
  console.log("1. Deploying ERC6551Registry...");
  const Registry = await ethers.getContractFactory("ERC6551Registry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("   ✓ ERC6551Registry deployed to:", registry.target);
  await waitForNonceSync(3000);

  // 2. Deploy Account Implementation
  await waitForNonceSync();
  console.log("2. Deploying ERC6551Account...");
  const Account = await ethers.getContractFactory("ERC6551Account");
  const accountImpl = await Account.deploy();
  await accountImpl.waitForDeployment();
  console.log("   ✓ ERC6551Account Implementation deployed to:", accountImpl.target);
  await waitForNonceSync(3000);

  // 3. Deploy Profile NFT
  await waitForNonceSync();
  console.log("3. Deploying SkillerProfile...");
  const Profile = await ethers.getContractFactory("SkillerProfile");
  const profile = await Profile.deploy(deployer.address);
  await profile.waitForDeployment();
  console.log("   ✓ SkillerProfile deployed to:", profile.target);
  await waitForNonceSync(3000);

  // 4. Deploy Items
  await waitForNonceSync();
  console.log("4. Deploying SkillerItems...");
  const Items = await ethers.getContractFactory("SkillerItems");
  const items = await Items.deploy(deployer.address);
  await items.waitForDeployment();
  console.log("   ✓ SkillerItems deployed to:", items.target);
  await waitForNonceSync(3000);

  // 5. Configure SkillerProfile
  await waitForNonceSync();
  console.log("5. Configuring SkillerProfile...");
  const configTx = await profile.setConfig(items.target, registry.target, accountImpl.target);
  await configTx.wait();
  console.log("   ✓ SkillerProfile configured");

  // Output for frontend config
  const addresses = {
    ERC6551Registry: registry.target,
    ERC6551Account: accountImpl.target,
    SkillerProfile: profile.target,
    SkillerItems: items.target
  };
  
  console.log("\n--- Frontend Config ---");
  console.log(JSON.stringify(addresses, null, 2));

  const fs = require("fs");
  const path = require("path");
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`\n✓ Addresses written to ${addressesPath}`);
  console.log("\n✓ Deployment complete! Users can now mint profiles through the frontend.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
