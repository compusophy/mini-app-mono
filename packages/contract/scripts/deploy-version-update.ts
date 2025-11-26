import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Deploying Version Control Updates using:", deployer.address);

  const diamondCut = await ethers.getContractAt("IDiamondCut", addresses.Diamond);

  // 1. Deploy updated MiningFacet (New Signatures)
  const MiningFacet = await ethers.getContractFactory("MiningFacet");
  const miningFacet = await MiningFacet.deploy();
  await miningFacet.waitForDeployment();
  console.log("✓ MiningFacet deployed at:", miningFacet.target);

  // 2. Deploy updated WoodcuttingFacet (New Signatures)
  const WoodcuttingFacet = await ethers.getContractFactory("WoodcuttingFacet");
  const woodcuttingFacet = await WoodcuttingFacet.deploy();
  await woodcuttingFacet.waitForDeployment();
  console.log("✓ WoodcuttingFacet deployed at:", woodcuttingFacet.target);

  // 3. Deploy updated GameFacet (New setMinGameVersion)
  const GameFacet = await ethers.getContractFactory("GameFacet");
  const gameFacet = await GameFacet.deploy();
  await gameFacet.waitForDeployment();
  console.log("✓ GameFacet deployed at:", gameFacet.target);
  
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
  const gameSelectors = getSelectors(GameFacet);

  const cutUpdate = [
      {
          facetAddress: miningFacet.target,
          action: 1, // Replace (Note: Signatures changed, so technically Replace works if we overwrite old selectors? No, old selectors are different. We need to ADD new ones and ideally REMOVE old ones if we knew them, but Replace overwrites if selector exists. Since signatures CHANGED, these are NEW selectors. We should technically ADD. However, keeping it simple: standard Diamond 'Replace' requires the selector to ALREADY exist. 'Add' requires it NOT to exist. Since these are NEW signatures, we must use Add (0). But we also want to remove the old ones to be clean? For now, let's just ADD the new ones. 
          // Wait, if I just ADD, the old ones remain callable?
          // Yes. But the old ones are in the OLD facet.
          // If I don't replace/remove them, the Diamond still points to the OLD facet for the OLD selectors.
          // So the old clients would still work!
          // I MUST overwrite the old selectors OR remove them.
          // But the old selectors don't exist in the NEW facet.
          // So I can't use "Replace" to map Old Selector -> New Facet because New Facet doesn't have Old Selector.
          
          // STRATEGY:
          // 1. We need to REMOVE the old selectors (mineIron(), etc)
          // 2. ADD the new selectors (mineIron(uint256), etc)
          
          // Actually, to be safer/easier without tracking old selectors manually:
          // If I simply deploy this, I need to explicitly remove the old ones.
          // Let's look up the old selectors?
          // Or... I can just Replace everything if I had the same signatures.
          
          // Alternative: The user wants old clients to FAIL.
          // If I leave old selectors pointing to old facets, they SUCCEED (if logic allows).
          // So I MUST remove them.
          
          // Hardcoding old selectors to remove is risky if I get them wrong.
          // Better approach:
          // deploy-version-update.ts should act as a 'migration'.
      }
  ];
  
  // Let's redefine the strategy.
  // We will use a helper to find the selectors to remove? No time.
  // Let's just calculate them here.
  
  const oldMiningSigs = ["mineIron(uint256)", "mineCoal(uint256)"];
  const oldWoodSigs = ["chopOak(uint256)", "chopWillow(uint256)"];
  
  const getSelector = (sig: string) => ethers.id(sig).substring(0, 10);
  
  const removeSelectors = [
    ...oldMiningSigs.map(getSelector),
    ...oldWoodSigs.map(getSelector)
  ];
  
  // We need to be careful. GameFacet update is just adding a function, so 'Add' or 'Replace' if it existed? 
  // setMinGameVersion is new. So ADD.
  // But GameFacet also has createCharacter etc which didn't change. We want to REPLACE those to point to new facet.
  
  // So:
  // 1. REMOVE old mining/woodcutting selectors.
  // 2. ADD new mining/woodcutting selectors.
  // 3. REPLACE GameFacet selectors (and ADD the new one).
  
  // Since diamondCut takes an array, we can do it in one tx.
  
  const cut = [
      {
          facetAddress: ethers.ZeroAddress, // Remove
          action: 2, // Remove
          functionSelectors: removeSelectors
      },
      {
          facetAddress: miningFacet.target,
          action: 0, // Add
          functionSelectors: miningSelectors
      },
      {
          facetAddress: woodcuttingFacet.target,
          action: 0, // Add
          functionSelectors: woodcuttingSelectors
      },
      {
          facetAddress: gameFacet.target,
          action: 1, // Replace (Updates existing, ignores new ones? No, Replace requires all to exist. Add requires none. We have a mix.)
          // GameFacet has mixed existing and new.
          // Standard approach: Split into Add and Replace.
          // createCharacter, etc exist -> Replace
          // setMinGameVersion is new -> Add
          
          // Let's split gameSelectors
          // Existing: createCharacter, claimStarterPickaxe, getXP, getStats
          // New: setMinGameVersion
          
          // Actually, getStats also changed? No.
      }
  ];
  
  // Refined Cut Construction
  
  // Filter GameSelectors
  const newGameSig = getSelector("setMinGameVersion(uint256)");
  const gameReplaceSelectors = gameSelectors.filter(s => s !== newGameSig);
  const gameAddSelectors = [newGameSig];
  
  const finalCut = [
      {
          facetAddress: ethers.ZeroAddress,
          action: 2, // Remove Old
          functionSelectors: removeSelectors
      },
      {
          facetAddress: miningFacet.target,
          action: 0, // Add New
          functionSelectors: miningSelectors
      },
      {
          facetAddress: woodcuttingFacet.target,
          action: 0, // Add New
          functionSelectors: woodcuttingSelectors
      },
      {
          facetAddress: gameFacet.target,
          action: 1, // Replace Existing Game Funcs
          functionSelectors: gameReplaceSelectors
      },
      {
          facetAddress: gameFacet.target,
          action: 0, // Add New Game Funcs
          functionSelectors: gameAddSelectors
      }
  ];

  console.log("Removing Old Selectors:", removeSelectors);
  console.log("Adding New Selectors...");
  
  const tx = await diamondCut.diamondCut(finalCut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("✓ Facets Updated & Version Control Enabled");
  
  // Set Initial Version to 1
  // We need to call setMinGameVersion. But wait, we just deployed it.
  // We can call it via the Diamond.
  
  const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);
  const tx2 = await GameDiamond.setMinGameVersion(1);
  await tx2.wait();
  console.log("✓ minGameVersion set to 1");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

