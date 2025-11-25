import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Deploying VoidFacet with account:", deployer.address);
  
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

  // 1. Deploy VoidFacet
  console.log("1. Deploying VoidFacet...");
  const VoidFacet = await ethers.getContractFactory("VoidFacet");
  const voidFacet = await VoidFacet.deploy();
  await voidFacet.waitForDeployment();
  console.log("   ✓ VoidFacet deployed at:", voidFacet.target);

  await waitForNonceSync();

  // 3. Cut Diamond
  console.log("2. Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  const selectors = [];
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  const cut = {
      facetAddress: voidFacet.target,
      action: 0, // Add
      functionSelectors: selectors
  };

  try {
      const tx = await diamondCut.diamondCut([cut], ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
  }

  console.log("   ✓ Void Installed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
