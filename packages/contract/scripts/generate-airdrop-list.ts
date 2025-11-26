
import { ethers } from "hardhat";
import fs from "fs";
import addresses from "../../frontend/src/lib/addresses.json";

async function main() {
    const diamondAddr = addresses.Diamond;
    const profileAddr = addresses.SkillerProfileV2;

    const provider = ethers.provider;
    const chainId = (await provider.getNetwork()).chainId;

    console.log(`Generating Airdrop List on Chain ${chainId}`);

    // 1. Get Contracts
    const Profile = await ethers.getContractAt("SkillerProfileV2", profileAddr);
    const StatsFacet = await ethers.getContractAt("StatsFacet", diamondAddr);

    // 2. Get Total Supply
    const totalSupply = await Profile.totalSupply();
    console.log(`Total Supply: ${totalSupply}`);

    const balances = new Map<string, bigint>();
    const tokenCount = Number(totalSupply);
    const batchSize = 50; // Process 50 at a time

    // 3. Iterate and Fetch Data
    for (let i = 0; i < tokenCount; i += batchSize) {
        const promises = [];
        const end = Math.min(i + batchSize, tokenCount);
        
        console.log(`Processing ${i} to ${end} / ${tokenCount}...`);

        for (let j = i; j < end; j++) {
            promises.push((async () => {
                try {
                    // Get Token ID by Index (handles gaps/burns if any)
                    const tokenId = await Profile.tokenByIndex(j);
                    
                    // Parallel fetch owner and stats
                    const [owner, stats] = await Promise.all([
                        Profile.ownerOf(tokenId),
                        StatsFacet.getStats(tokenId)
                    ]);

                    // stats: [miningXp, miningLevel, woodcuttingXp, woodcuttingLevel]
                    const miningXp = stats[0];
                    const woodcuttingXp = stats[2];
                    const totalXp = miningXp + woodcuttingXp;

                    return { owner, totalXp, tokenId };
                } catch (e) {
                    console.error(`Error processing index ${j}:`, e.message);
                    return null;
                }
            })());
        }

        const results = await Promise.all(promises);

        for (const res of results) {
            if (!res) continue;
            const { owner, totalXp } = res;
            
            const current = balances.get(owner) || 0n;
            balances.set(owner, current + totalXp);
        }
    }

    // 4. Generate CSV
    console.log("\nGenerating CSV...");
    let csvContent = "address,amount\n";
    let totalTokens = 0n;
    let uniqueAddresses = 0;

    for (const [address, amount] of balances) {
        // Format amount? User said "1 xp = 1 token". 
        // XP is usually integer (wei-like or just number).
        // If XP is 54,000,000, then amount is 54000000.
        // Do they want decimals? Usually airdrop files expect raw units or formatted.
        // Standard ERC20 usually has 18 decimals.
        // If I write 54000000 into the CSV, and the token has 18 decimals, it effectively means very little.
        // BUT, XP in this game is large (Level 124 is 54 million).
        // If we treat 1 XP as 1.0 Token (18 decimals), that's HUGE supply.
        // If we treat 1 XP as 1 Wei, it's tiny.
        // "1 xp = 1 token" likely means 1 whole token.
        // If the csv is for a tool like disperse.app or safe, they usually take decimal strings.
        // I will output the number as is (integer string).
        // 54000000 XP -> 54000000 Tokens.
        
        csvContent += `${address},${amount.toString()}\n`;
        totalTokens += amount;
        uniqueAddresses++;
    }

    const fileName = "airdrop_xp.csv";
    fs.writeFileSync(fileName, csvContent);

    console.log(`\nSaved to ${fileName}`);
    console.log(`Total Tokens to Distribute: ${totalTokens}`);
    console.log(`Unique Addresses: ${uniqueAddresses}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

