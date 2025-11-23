
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const diamondAddress = addresses.Diamond;
    const newMigrationAddr = addresses.SkillerMigration;

    console.log("Diamond:", diamondAddress);
    console.log("New Migration:", newMigrationAddr);

    // Calculate storage slot
    // keccak256("skiller.game.storage")
    const storagePosition = ethers.keccak256(ethers.toUtf8Bytes("skiller.game.storage"));
    const storageSlotBigInt = BigInt(storagePosition);
    
    // Struct layout:
    // 0: items
    // 1: profile
    // 2: registry
    // 3: accountImplementation
    // 4: itemLevelRequirements (mapping)
    // 5: xp (mapping)
    // 6: migrationContract
    
    const migrationSlot = storageSlotBigInt + 6n;
    
    const provider = ethers.provider;
    const storageValue = await provider.getStorage(diamondAddress, migrationSlot);
    
    // Convert storage value (32 bytes) to address
    // Last 20 bytes
    const storedAddress = "0x" + storageValue.slice(-40);
    console.log("Stored Migration Address:", storedAddress);

    if (storedAddress.toLowerCase() === newMigrationAddr.toLowerCase()) {
        console.log("SUCCESS: Diamond has correct migration contract set.");
    } else {
        console.log("WARNING: Diamond has INCORRECT migration contract set!");
        
        // Fix it
        const [deployer] = await ethers.getSigners();
        console.log("Deployer:", deployer.address);
        
        // Try to call AdminFacet setMigrationContract
        // Note: AdminFacet function signature: setMigrationContract(address)
        const AdminFacet = await ethers.getContractAt("AdminFacet", diamondAddress);
        
        try {
            const tx = await AdminFacet.setMigrationContract(newMigrationAddr);
            console.log("Updating migration contract... Hash:", tx.hash);
            await tx.wait();
            console.log("Diamond configuration updated!");
        } catch (e) {
            console.error("Failed to update Diamond configuration:", e.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

