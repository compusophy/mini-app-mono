import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = require("../../frontend/src/lib/addresses-v2.json");
  
  console.log("Resetting Void Leaderboard...");
  console.log("Deployer:", deployer.address);
  console.log("Diamond:", addresses.Diamond);
  
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

  // 1. Deploy New VoidFacet
  console.log("1. Deploying VoidFacet...");
  const VoidFacet = await ethers.getContractFactory("VoidFacet");
  const voidFacet = await VoidFacet.deploy();
  await voidFacet.waitForDeployment();
  console.log("   ✓ VoidFacet deployed at:", voidFacet.target);

  await waitForNonceSync();

  // 2. Prepare Cuts
  const selectors = [];
  // @ts-ignore
  for (const fragment of VoidFacet.interface.fragments) {
      if (fragment.type === "function") {
          selectors.push(fragment.selector);
      }
  }

  // Identify new vs existing selectors
  // New: resetLeaderboard (0x...)
  // Existing: getVoidCost, getVoidLevel, sacrificeToVoid, getLeaderboard
  
  // @ts-ignore
  const resetSelector = VoidFacet.interface.getFunction("resetLeaderboard").selector;
  const otherSelectors = selectors.filter(s => s !== resetSelector);

  const cuts = [
      {
          facetAddress: voidFacet.target,
          action: 0, // Add
          functionSelectors: [resetSelector]
      },
      {
          facetAddress: voidFacet.target,
          action: 1, // Replace
          functionSelectors: otherSelectors
      }
  ];

  // 3. Cut Diamond
  console.log("2. Cutting Diamond...");
  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);
  
  try {
      // @ts-ignore
      const tx = await diamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x");
      await tx.wait();
      console.log("   ✓ Diamond Cut Successful");
  } catch (e) {
      console.error("   ❌ Diamond Cut Failed:", e);
      process.exit(1);
  }

  await waitForNonceSync();

  // 4. Call resetLeaderboard
  console.log("3. Resetting Leaderboard...");
  const voidContract = await ethers.getContractAt("VoidFacet", addresses.Diamond);
  try {
      const tx = await voidContract.resetLeaderboard();
      await tx.wait();
      console.log("   ✓ Leaderboard Reset Successful");
  } catch (e) {
      console.error("   ❌ Reset Failed:", e);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

