import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const addresses = require("../../frontend/src/lib/addresses-v2.json");
    
    console.log("Reissuing items based on XP for Skiller #64...");
    console.log("Deployer:", deployer.address);

    const Registry = await ethers.getContractAt("IERC6551Registry", addresses.ERC6551Registry);
    const ItemsV2 = await ethers.getContractAt("SkillerItemsV2", addresses.SkillerItemsV2);
    const GameDiamond = await ethers.getContractAt("GameFacet", addresses.Diamond);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const accountImpl = addresses.ERC6551Account;

    // Item IDs
    const BRONZE_AXE = 101n;
    const BRONZE_PICKAXE = 151n;
    const IRON_AXE = 102n;
    const IRON_PICKAXE = 152n;
    const OAK_LOG = 201n;
    const IRON_ORE = 301n;
    const GOLD_COINS = 1n;

    const tokenId = 62;
    console.log(`\nChecking Profile #${tokenId}...`);

    // 1. Get NEW TBA Address
    const tba = await Registry.account(
        accountImpl,
        0,
        chainId,
        addresses.SkillerProfileV2,
        tokenId
    );
    console.log(` - TBA: ${tba}`);
    
    // 3. Starter Pack Check
    const bAxe = await ItemsV2.balanceOf(tba, BRONZE_AXE);
    const iAxe = await ItemsV2.balanceOf(tba, IRON_AXE);
    const bPick = await ItemsV2.balanceOf(tba, BRONZE_PICKAXE);
    const iPick = await ItemsV2.balanceOf(tba, IRON_PICKAXE);
    const gold = await ItemsV2.balanceOf(tba, GOLD_COINS);

    if (bAxe === 0n && iAxe === 0n) {
        console.log("   -> Missing Axe! Minting Bronze Axe...");
        await (await ItemsV2.mint(tba, BRONZE_AXE, 1, "0x")).wait();
    }

    if (bPick === 0n && iPick === 0n) {
        console.log("   -> Missing Pickaxe! Minting Bronze Pickaxe...");
        await (await ItemsV2.mint(tba, BRONZE_PICKAXE, 1, "0x")).wait();
    }

    if (gold === 0n) {
        console.log("   -> Missing Gold! Minting 25 Gold...");
        await (await ItemsV2.mint(tba, GOLD_COINS, ethers.parseEther("25"), "0x")).wait();
    }

    // 4. Resource Restoration based on XP
    const stats = await GameDiamond.getStats(tokenId);
    const miningXp = stats.miningXp;
    const woodcuttingXp = stats.woodcuttingXp;

    console.log(`   -> XP: Mining=${miningXp}, Wood=${woodcuttingXp}`);

    // Calculate Resources
    // Assumption: 10 XP = 1 Resource
    const expectedOre = miningXp / 10n;
    const expectedLogs = woodcuttingXp / 10n;

    const currentOre = await ItemsV2.balanceOf(tba, IRON_ORE);
    const currentLogs = await ItemsV2.balanceOf(tba, OAK_LOG);

    // MINING CHECK
    if (expectedOre > currentOre) {
        const diff = expectedOre - currentOre;
        if (diff > 0n) {
            console.log(`   -> Restoring ${diff} Iron Ore (Mining XP: ${miningXp})...`);
            await (await ItemsV2.mint(tba, IRON_ORE, diff, "0x")).wait();
        }
    } else {
        console.log(`   -> Ore balance sufficient (Expected: ${expectedOre}, Current: ${currentOre})`);
    }

    // WOODCUTTING CHECK
    if (expectedLogs > currentLogs) {
        const diff = expectedLogs - currentLogs;
        if (diff > 0n) {
            console.log(`   -> Restoring ${diff} Oak Logs (Woodcutting XP: ${woodcuttingXp})...`);
            await (await ItemsV2.mint(tba, OAK_LOG, diff, "0x")).wait();
        }
    } else {
        console.log(`   -> Logs balance sufficient (Expected: ${expectedLogs}, Current: ${currentLogs})`);
    }

    console.log("\nReissue complete for #64!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

