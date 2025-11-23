
import { ethers } from "hardhat";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    // Contracts
    const ItemsV1 = await ethers.getContractAt("ISkillerItems", addresses.SkillerItems);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    const Registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    
    const accountImpl = addresses.ERC6551Account;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    // Ensure Deployer is Minter
    const isMinter = await ItemsV2.minters(deployer.address);
    if (!isMinter) {
        console.log("Deployer is not a minter. Granting minter role...");
        // This will only work if Deployer is OWNER of ItemsV2
        try {
            const tx = await ItemsV2.setMinter(deployer.address, true);
            await tx.wait();
            console.log("Minter role granted to deployer.");
        } catch (e) {
            console.error("Failed to grant minter role:", e);
        }
    }

    console.log(`Total V2 Profiles: ${await ProfileV2.totalSupply()}`);

    const syncIds = [101, 151, 201, 301];

    const totalProfiles = await ProfileV2.totalSupply();
    for (let i = 0; i < totalProfiles; i++) {
        try {
            const tokenId = await ProfileV2.tokenByIndex(i);
            if (tokenId !== 1n) continue; // Target specific ID
            
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

            let mintedAny = false;

            // Item Sync
            for (const id of syncIds) {
                let v1Bal = 0n;
                try { v1Bal = await ItemsV1.balanceOf(v1TBA, id); } catch (e) {}
                
                let v2Bal = await ItemsV2.balanceOf(v2TBA, id);

                if (v1Bal > 0n && v2Bal === 0n) {
                    console.log(`   -> Syncing Item ${id}: Minting ${v1Bal}`);
                    const tx = await ItemsV2.mint(v2TBA, id, v1Bal, "0x");
                    await tx.wait();
                    mintedAny = true;
                }
            }

            // Starter Pack - Check BOTH Axe and Pickaxe
            // We check if they have ANY axe (101/102) and ANY pickaxe (151/152)
            const bronzeAxe = await ItemsV2.balanceOf(v2TBA, 101);
            const ironAxe = await ItemsV2.balanceOf(v2TBA, 102);
            
            if (bronzeAxe === 0n && ironAxe === 0n) {
                console.log(`   -> Missing Axe! Minting Bronze Axe (101)...`);
                try {
                    const tx = await ItemsV2.mint(v2TBA, 101, 1, "0x");
                    await tx.wait();
                    mintedAny = true;
                } catch (e) { console.error("Failed to mint axe:", e); }
            }

            const bronzePick = await ItemsV2.balanceOf(v2TBA, 151);
            const ironPick = await ItemsV2.balanceOf(v2TBA, 152);
            
            if (bronzePick === 0n && ironPick === 0n) {
                console.log(`   -> Missing Pickaxe! Minting Bronze Pickaxe (151)...`);
                try {
                    const tx = await ItemsV2.mint(v2TBA, 151, 1, "0x");
                    await tx.wait();
                    mintedAny = true;
                } catch (e) { console.error("Failed to mint pickaxe:", e); }
            }

            // Gold Check
            const gold = await ItemsV2.balanceOf(v2TBA, 1);
            if (gold === 0n) {
                const giftAmount = ethers.parseEther("25");
                console.log(`   -> No Gold! Gift 25 Gold...`);
                try {
                    const tx = await ItemsV2.mint(v2TBA, 1, giftAmount, "0x");
                    await tx.wait();
                    mintedAny = true;
                } catch (e) { console.error("Failed to mint gold:", e); }
            }

            if (mintedAny) {
                console.log(" -> Items Synced!");
            } else {
                console.log(" -> All good.");
            }

        } catch (e) {
            console.error(`Error processing index ${i}:`, e);
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
