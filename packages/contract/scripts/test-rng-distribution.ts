import { ethers } from "hardhat";

async function main() {
    const addresses = require("../../frontend/src/lib/addresses.json");
    
    const tbaAddress = "0x3384aF3cEE93F577697C1431De8C2589f5060F4B"; 
    
    console.log("Simulating RNG distribution using recent block data...");
    
    let totalMultiplier = 0n;
    const runs = 10;
    
    const provider = ethers.provider;
    const currentBlock = await provider.getBlockNumber();
    
    console.log(`Starting from block ${currentBlock}`);

    for(let i = 0; i < runs; i++) {
        const block = await provider.getBlock(currentBlock - i);
        if(!block) continue;

        const timestamp = block.timestamp;
        const prevrandao = block.prevRandao;
        const from = tbaAddress;
        const fromItems = addresses.SkillerItemsV2;
        const id = 1;
        const value = 1000n * 10n**18n;
        
        const gasleft = 500000 - (i * 1234); 

        // Handle prevRandao being null (e.g. pre-Merge blocks or some L2s might differ, but Base should have it)
        // If null, assume 0 for simulation
        const finalPrevRandao = prevrandao || 0;

        const packed = ethers.solidityPacked(
            ["uint256", "uint256", "address", "address", "uint256", "uint256", "uint256"],
            [timestamp, finalPrevRandao, fromItems, from, id, value, gasleft]
        );
        
        const seed = ethers.keccak256(packed);
        const seedBn = BigInt(seed);
        const multiplier = seedBn % 201n;
        
        totalMultiplier += multiplier;
        
        console.log(`Run ${i+1}: Multiplier ${Number(multiplier)/100}x (Block: ${block.number})`);
    }
    
    const avg = Number(totalMultiplier) / runs;
    console.log(`\nAverage Multiplier over ${runs} runs: ${avg/100}x`);
    console.log(`Expected Value: ~1.00x (Law of Large Numbers applies over many runs)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
