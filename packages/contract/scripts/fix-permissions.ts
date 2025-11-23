
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const oldMigrationAddr = "0xdC4186cD2b68524bD26B27235FE67D54B150048B"; // From findings
    const newMigrationAddr = addresses.SkillerMigration; // 0xb414...
    console.log("New Migration:", newMigrationAddr);

    const profileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    const itemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    
    // Check Old Migration Owner
    const oldMig = await ethers.getContractAt("SkillerMigration", oldMigrationAddr);
    try {
        const oldMigOwner = await oldMig.owner();
        console.log(`Old Migration (${oldMigrationAddr}) Owner: ${oldMigOwner}`);
        if (oldMigOwner !== deployer.address) {
            console.log("WARNING: Deployer is NOT owner of Old Migration contract!");
        }
    } catch (e) {
        console.log("Could not get owner of Old Migration (might not be Ownable or verified):", e.message);
    }

    // 1. Recover SkillerProfileV2 Ownership
    const currentProfileOwner = await profileV2.owner();
    console.log("Current Profile Owner:", currentProfileOwner);

    if (currentProfileOwner === oldMigrationAddr) {
        console.log("Recovering Profile ownership from Old Migration directly to New Migration...");
        // Recover directly to new migration to save a step, or to deployer if we want to be safe.
        // Let's recover to deployer first to verify control.
        try {
            const tx = await oldMig.recoverOwnership(addresses.SkillerProfileV2, newMigrationAddr);
            console.log("Transaction sent:", tx.hash);
            await tx.wait();
            console.log("Recovered directly to New Migration!");
        } catch (e) {
            console.error("Failed to recover ownership:", e.message);
        }
    } else if (currentProfileOwner === newMigrationAddr) {
        console.log("Profile already owned by New Migration.");
    } else {
        console.log("Profile owned by someone else:", currentProfileOwner);
    }

    // 2. Grant Minter Role to New Migration on SkillerItemsV2
    // Check Items Owner
    const itemsOwner = await itemsV2.owner();
    console.log("Items Owner:", itemsOwner);
    
    if (itemsOwner !== deployer.address) {
         console.log("WARNING: Deployer is NOT owner of Items contract!");
         // If Items is owned by Old Migration, we can try to recover it too?
         if (itemsOwner === oldMigrationAddr) {
             console.log("Items is owned by Old Migration. Attempting recover...");
             try {
                const tx = await oldMig.recoverOwnership(addresses.SkillerItemsV2, deployer.address);
                await tx.wait();
                console.log("Recovered Items to Deployer!");
             } catch (e) {
                 console.error("Failed to recover Items:", e.message);
             }
         }
    }

    console.log("Granting Minter role to New Migration on Items...");
    try {
        const isMinter = await itemsV2.minters(newMigrationAddr);
        if (!isMinter) {
            // If we are not owner, this will fail
            if (itemsOwner === deployer.address) {
                const tx = await itemsV2.setMinter(newMigrationAddr, true);
                await tx.wait();
                console.log("Minter role granted!");
            } else {
                console.log("Cannot grant minter role: Deployer is not owner.");
            }
        } else {
            console.log("Already a minter.");
        }
    } catch (e) {
        console.log("Error checking/setting minter:", e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
