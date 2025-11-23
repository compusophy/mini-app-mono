import { ethers } from "hardhat";

async function main() {
  const profileAddress = "0xbECD4F7B2e0435A0494CefAB3474255eA1f5712a";
  const migrationAddress = "0x207A6F6c54De8527496C5461b9AbB4D85D530052";

  const signers = await ethers.getSigners();
  console.log("Available signers:", signers.map(s => s.address));

  const SkillerProfileV2 = await ethers.getContractFactory("SkillerProfileV2");
  const profile = SkillerProfileV2.attach(profileAddress);

  const currentOwner = await profile.owner();
  console.log("Current SkillerProfileV2 Owner:", currentOwner);

  if (currentOwner.toLowerCase() === migrationAddress.toLowerCase()) {
      console.log("✅ Migration contract is already the owner.");
      return;
  }

  // Find the signer that matches the owner
  const ownerSigner = signers.find(s => s.address.toLowerCase() === currentOwner.toLowerCase());

  if (!ownerSigner) {
      console.error(`❌ No available signer matches the current owner (${currentOwner}).`);
      console.error(`   Please update your .env file with the PRIVATE_KEY for ${currentOwner}`);
      return;
  }

  console.log(`✅ Found signer for owner: ${ownerSigner.address}`);
  console.log(`Transferring ownership to SkillerMigration (${migrationAddress})...`);
  
  const tx = await profile.connect(ownerSigner).transferOwnership(migrationAddress);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("✅ Ownership transferred successfully!");
  
  const newOwner = await profile.owner();
  console.log("New Owner:", newOwner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
