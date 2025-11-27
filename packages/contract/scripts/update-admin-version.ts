import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Updating Game Version with account:", deployer.address);
  
  const waitForNonceSync = async (minWaitMs = 2000) => {
    let attempts = 0;
    while (attempts < 10) {
      const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
      const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      if (pendingNonce === latestNonce) {
        await new Promise(resolve => setTimeout(resolve, minWaitMs));
        return;
      }
      console.log(`   ⏳ Waiting for nonce sync... (p=${pendingNonce}, l=${latestNonce})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
  };

  await waitForNonceSync();

  // 3. Set Min Game Version
  console.log("Setting Min Game Version to 150...");
  // Need to cast Diamond to AdminFacet to call the function
  const gameAdmin = await ethers.getContractAt("AdminFacet", addresses.Diamond);
  const txV = await gameAdmin.setMinGameVersion(150n);
  await txV.wait();
  console.log("✓ Min Game Version set to 150");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
