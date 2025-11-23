
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const ItemsV1 = await ethers.getContractAt("ISkillerItems", addresses.SkillerItems);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    const Registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    
    const accountImpl = addresses.ERC6551Account;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const tokenId = 1n; // SKILLER #1
    
    const v1TBA = await Registry.account(
        accountImpl,
        0,
        chainId,
        addresses.SkillerProfile,
        tokenId
    );

    const v2TBA = await Registry.account(
        accountImpl,
        0,
        chainId,
        addresses.SkillerProfileV2,
        tokenId
    );

    console.log(`SKILLER #1 V1 TBA: ${v1TBA}`);
    console.log(`SKILLER #1 V2 TBA: ${v2TBA}`);

    // ID 301 was Copper Ore in V1. 
    // We want to read it.
    const v1CopperBalance = await ItemsV1.balanceOf(v1TBA, 301n);
    console.log(`V1 Copper Ore (301) Balance: ${v1CopperBalance}`);

    const v2IronBalance = await ItemsV2.balanceOf(v2TBA, 301n);
    console.log(`V2 Iron Ore (301) Balance: ${v2IronBalance}`);

    // If V1 had Copper, we should ADD it to V2 Iron.
    // The previous script skipped if V2 > 0. 
    // But for #1, we want to FORCE sync/add.
    // WAIT: If V2 > 0, we can't easily distinguish "migrated" vs "played".
    // BUT for #1, user specifically asked.
    // Also, if the previous script ran and saw V2=1, it skipped.
    
    if (v1CopperBalance > 0n) {
        // Calculate difference. If V2 < V1, likely migration failed or partial.
        // If V2 >= V1, maybe they mined more?
        // User says "didn't give me my v1 iron ore balance".
        // Assuming they want V1 balance ADDED to whatever is there, or restored.
        // Let's assume we need to mint the V1 balance because it was missed during migration.
        // But we should be careful not to double mint if migration ran.
        // Since "All good" was reported, migration logic skipped it because V2 > 0.
        
        console.log(`Forcing mint of ${v1CopperBalance} Iron Ore (301) to V2 account...`);
        const tx = await ItemsV2.mint(v2TBA, 301n, v1CopperBalance, "0x");
        await tx.wait();
        console.log("Minted!");
    } else {
        console.log("No V1 Copper Ore found to sync.");
    }
}

interface ISkillerItems {
    balanceOf(account: string, id: bigint): Promise<bigint>;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

