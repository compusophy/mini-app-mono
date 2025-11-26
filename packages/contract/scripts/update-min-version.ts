import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load addresses
  const addressPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  
  console.log("Updating minGameVersion to 120 using:", deployer.address);

  const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);
  const tx = await GameDiamond.setMinGameVersion(120);
  await tx.wait();
  console.log("✓ minGameVersion set to 120");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

