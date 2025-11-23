
import { ethers } from "hardhat";
import path from "path";
import fs from "fs";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    // Load addresses manualy
    const addressesPath = path.join(__dirname, "../../frontend/src/lib/addresses-v2.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

    const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);
    const AdminFacet = await ethers.getContractAt("AdminFacet", addresses.Diamond);
    const ProfileV2 = await ethers.getContractAt("SkillerProfileV2", addresses.SkillerProfileV2);
    
    // Old Contracts (V1 Addresses hardcoded since they aren't in v2 json usually, but let's check)
    // Using addresses from addresses.json (V1)
    const V1_MINING = "0x792a1809d0e49d5dda18cfab6b95afae646ed56d";
    const V1_WOODCUTTING = "0xcc7c9077cfdae601cb38161800316b62857845d0";

    // Minimal ABIs
    const xpAbi = ["function profileXp(uint256) view returns (uint256)"];
    const OldMining = await ethers.getContractAt(xpAbi, V1_MINING);
    const OldWoodcutting = await ethers.getContractAt(xpAbi, V1_WOODCUTTING);

    const totalProfiles = await ProfileV2.totalSupply();
    console.log(`Total V2 Profiles: ${totalProfiles}`);
    
    // Helper to wait for nonce sync
    const waitForNonceSync = async (minWaitMs = 2000) => {
        const pending = await ethers.provider.getTransactionCount(deployer.address, "pending");
        const latest = await ethers.provider.getTransactionCount(deployer.address, "latest");
        if (pending !== latest) {
            console.log(`   Waiting for nonce sync (P:${pending} L:${latest})...`);
            await new Promise(r => setTimeout(r, 2000));
        }
    };

    for (let i = 0; i < totalProfiles; i++) {
        try {
            const tokenId = await ProfileV2.tokenByIndex(i);
            console.log(`Checking Profile #${tokenId}...`);

            // 1. Get Current V2 XP
            const stats = await GameDiamond.getStats(tokenId);
            const v2MiningXp = stats.miningXp;
            const v2WoodcuttingXp = stats.woodcuttingXp;

            // 2. Get Old V1 XP
            let v1MiningXp = 0n;
            let v1WoodcuttingXp = 0n;

            try { v1MiningXp = await OldMining.profileXp(tokenId); } catch {}
            try { v1WoodcuttingXp = await OldWoodcutting.profileXp(tokenId); } catch {}

            console.log(` - V1 XP: Mining=${v1MiningXp}, Wood=${v1WoodcuttingXp}`);
            console.log(` - V2 XP: Mining=${v2MiningXp}, Wood=${v2WoodcuttingXp}`);

            // 3. Sync Logic
            // If V1 > V2, we assume we missed the migration.
            // BUT if V2 > 0, maybe they played?
            // SAFE MODE: Only update if V2 is 0 and V1 > 0.
            // OR if V2 is significantly lower than V1 (e.g. they mined 1 iron in V2 but had 1000 XP in V1).
            // Let's just check: if V1 > V2, set it to V1.
            // This gives them "Credit" for their V1 XP even if they played a bit of V2 (if V1 was higher).
            // It's safer to give the higher value.
            
            let needUpdate = false;
            let newMiningXp = v2MiningXp;
            let newWoodcuttingXp = v2WoodcuttingXp;

            if (v1MiningXp > v2MiningXp) {
                newMiningXp = v1MiningXp;
                needUpdate = true;
            }
            
            if (v1WoodcuttingXp > v2WoodcuttingXp) {
                newWoodcuttingXp = v1WoodcuttingXp;
                needUpdate = true;
            }

            if (needUpdate) {
                console.log(` -> Syncing XP for #${tokenId} to Mining=${newMiningXp}, Wood=${newWoodcuttingXp}`);
                await waitForNonceSync();
                const tx = await AdminFacet.adminSetXP(tokenId, newMiningXp, newWoodcuttingXp);
                await tx.wait();
                console.log(" -> Synced!");
            } else {
                console.log(" -> No sync needed.");
            }

        } catch (e) {
            console.error(`Error processing index ${i}:`, e);
        }
    }
}

// Minimal Interface for Old Contracts
interface IOldSkillerXP {
    profileXp(tokenId: bigint): Promise<bigint>;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

