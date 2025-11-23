
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

    const tokenId = 1n; // Target SKILLER #1
    console.log(`\nChecking Profile #${tokenId}...`);

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
    
    console.log(` - V1 TBA: ${v1TBA}`);
    console.log(` - V2 TBA: ${v2TBA}`);

    // Debug Specific Items
    const syncIds = [101, 151, 201, 301];
    
    for (const id of syncIds) {
        const v1Bal = await ItemsV1.balanceOf(v1TBA, id);
        const v2Bal = await ItemsV2.balanceOf(v2TBA, id);
        console.log(`   Item ${id}: V1 Bal = ${v1Bal}, V2 Bal = ${v2Bal}`);
        
        if (v1Bal > 0n && v2Bal === 0n) {
             console.log(`   -> Syncing Item ${id}: Minting ${v1Bal}`);
             const tx = await ItemsV2.mint(v2TBA, id, v1Bal, "0x");
             await tx.wait();
             console.log("   -> Minted!");
        }
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

