import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Fixing getStats Collision using account:", deployer.address);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // 1. Deploy updated GameFacet (Without getStats)
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("✓ GameFacet deployed at:", gameFacet.target);
  
  // 2. Deploy StatsFacet (Just to get its selectors cleanly)
  // Actually we don't need to deploy if we just want selectors, but let's re-add it to be safe.
  // Wait, StatsFacet is already there.
  // We just need to ensure `getStats` points to StatsFacet.
  // But DiamondCut 'Replace' requires us to provide the address of the facet that HAS the selector.
  // If we want `getStats` to point to `StatsFacet`, we need `StatsFacet` address.
  // We can look it up or redeploy. Let's redeploy to be 100% sure of sync.
  
  const StatsFacet = await ethers.getContractFactory("StatsFacet");
  const statsFacet = await StatsFacet.deploy();
  await statsFacet.waitForDeployment();
  console.log("✓ StatsFacet deployed at:", statsFacet.target);

  const getSelectors = (contract: any) => {
      const sels = [];
      for (const fragment of contract.interface.fragments) {
          if (fragment.type === "function" && fragment.name !== "supportsInterface") {
              sels.push(fragment.selector);
          }
      }
      return sels;
  };

  const gameSelectors = getSelectors(GameFacet);
  const statsSelectors = getSelectors(StatsFacet);
  
  // We want:
  // 1. GameFacet selectors -> Point to new GameFacet
  // 2. StatsFacet selectors -> Point to new StatsFacet (including getStats)
  
  // Since we messed up the previous deploy by overwriting getStats with GameFacet,
  // we can just "Replace" all of them again.
  
  const cut = [
      {
          facetAddress: gameFacet.target,
          action: 1, // Replace
          functionSelectors: gameSelectors
      },
      {
          facetAddress: statsFacet.target,
          action: 1, // Replace (This will reclaim getStats for StatsFacet)
          functionSelectors: statsSelectors
      }
  ];

  console.log("Replacing Selectors for GameFacet and StatsFacet...");
  
  const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ Fixed: getStats now handled by StatsFacet");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

