const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying SkillerChopping with the account:", deployer.address);

  // Load existing addresses
  const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

  console.log("Using addresses:", addresses);

  const SkillerChopping = await hre.ethers.getContractFactory("SkillerChopping");
  const chopping = await SkillerChopping.deploy(
    addresses.SkillerItems,
    addresses.SkillerProfile,
    addresses.ERC6551Registry,
    addresses.ERC6551Account,
    deployer.address
  );

  await chopping.waitForDeployment();

  console.log("SkillerChopping deployed to:", chopping.target);

  // Update addresses.json
  addresses.SkillerChopping = chopping.target;
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("Updated addresses.json");

  console.log("\nIMPORTANT: You must now grant the MINTER role to this contract on SkillerItems.");
  console.log(`Run: npx hardhat run scripts/grant-minter.ts --network base`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
