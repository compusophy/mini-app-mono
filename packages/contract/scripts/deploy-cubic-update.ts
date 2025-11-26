import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Deploying Cubic XP System (v2) using:", deployer.address);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // 1. Deploy updated MiningFacet
  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("✓ MiningFacet deployed at:", miningFacet.target);

  // 2. Deploy updated WoodcuttingFacet
  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("✓ WoodcuttingFacet deployed at:", woodcuttingFacet.target);

  // 3. Deploy updated StatsFacet
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

  const miningSelectors = getSelectors(MiningFacet);
  const woodcuttingSelectors = getSelectors(WoodcuttingFacet);
  const statsSelectors = getSelectors(StatsFacet);

  // We are keeping the signatures the same (except internal logic changed), so we use Replace.
  // Wait, I added `version` param to Mining/Woodcutting in the previous step. 
  // Did I change signatures again?
  // No, I just updated the INTERNAL logic of `getLevel` and `_chop`/`_mine` (implicit via `getLevel`).
  // The external signatures `chopOak(tokenId, version)` remain the same as the last deployment.
  // So "Replace" is correct.
  
  const cut = [
      {
          facetAddress: miningFacet.target,
          action: 1, // Replace
          functionSelectors: miningSelectors
      },
      {
          facetAddress: woodcuttingFacet.target,
          action: 1, // Replace
          functionSelectors: woodcuttingSelectors
      },
      {
          facetAddress: statsFacet.target,
          action: 1, // Replace
          functionSelectors: statsSelectors
      }
  ];

  console.log("Replacing Selectors with Cubic Logic...");
  
  const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ Facets Updated");
  
  // Bump Version to 2
  const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);
  const tx2 = await GameDiamond.setMinGameVersion(2);
  await tx2.wait();
  console.log("✓ minGameVersion set to 2 (Forces update for Cubic Logic)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

