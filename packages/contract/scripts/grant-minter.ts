const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

  const items = await hre.ethers.getContractAt("SkillerItems", addresses.SkillerItems);
  const choppingAddress = addresses.SkillerChopping;

  console.log(`Granting minter role to ${choppingAddress} on SkillerItems at ${items.target}`);

  const tx = await items.setMinter(choppingAddress, true);
  await tx.wait();

  console.log("Role granted successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

