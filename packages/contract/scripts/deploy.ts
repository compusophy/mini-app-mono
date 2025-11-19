import { ethers } from "hardhat";

async function main() {
  const greeting = "Hello, World!";
  console.log(`Deploying Greeter with greeting: ${greeting}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const greeter = await ethers.deployContract("Greeter", [greeting], deployer);

  await greeter.waitForDeployment();

  console.log(`Greeter deployed to ${greeter.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

