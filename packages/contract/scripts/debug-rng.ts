import { ethers } from "hardhat";

async function main() {
    // Mock values similar to contract
    const timestamp = Math.floor(Date.now() / 1000);
    const prevrandao = 0; // Localhost might be 0
    const from = "0x3384aF3cEE93F577697C1431De8C2589f5060F4B"; // Skiller #1
    const id = 1;
    const value = 1000n * 10n**18n;

    console.log("Simulating RNG...");
    
    for(let i = 0; i < 10; i++) {
        // Simulate slight variations in timestamp/block
        const ts = timestamp + i;
        
        // Emulate Solidity keccak256 packing
        const packed = ethers.solidityPacked(
            ["uint256", "uint256", "address", "uint256", "uint256"],
            [ts, prevrandao, from, id, value]
        );
        
        const seed = ethers.keccak256(packed);
        const seedBn = BigInt(seed);
        const multiplier = seedBn % 201n;
        
        console.log(`Run ${i}: Multiplier ${multiplier} (${Number(multiplier)/100}x)`);
    }
}

main();
