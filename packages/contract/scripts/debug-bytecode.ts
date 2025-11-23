import { createPublicClient, http, Address } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org')
})

async function debugBytecode() {
    const tbaAddress = '0x9e7feE6eDe8f0bbd919A5A5c13dda31147366fE6'
    
    // 1. Get Full Bytecode
    const code = await client.getBytecode({ address: tbaAddress as Address })
    
    if (!code || code === '0x') {
        console.log('No code at address')
        return
    }

    console.log('Code length:', code.length)
    console.log('Code (last 200 chars):', code.slice(-200))
    
    // The footer should be at the end.
    // Expected footer structure: 0x60 bytes (96 bytes)
    // [salt (32 bytes)] [chainId (32 bytes)] [tokenContract (32 bytes - padded address)] [tokenId (32 bytes)] ? 
    // Wait, the assembly code says:
    // extcodecopy(address(), add(footer, 0x20), 0x37, 0x60)
    // It copies 0x60 (96) bytes from offset 0x37 (55).
    // This implies the footer starts at byte 55 of the deployed code?
    // Or is 0x37 the offset from the END?
    // ERC-6551 standard usually appends data to the end.
    
    // Let's look at the registry code again:
    /*
        abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73", // 20 bytes
            implementation_, // 20 bytes
            hex"5af43d82803e903d91602b57fd5bf3", // 15 bytes
            abi.encode(salt_, chainId_, tokenContract_, tokenId_) // 32 * 4 = 128 bytes?
        );
    */
    
    // Total length of header = 20 + 20 + 15 = 55 bytes (0x37)
    // So the footer starts at index 55 (0x37).
    // It copies 0x60 (96 bytes).
    // abi.encode(salt, chainId, tokenContract, tokenId) produces 4 * 32 = 128 bytes.
    // But the registry code uses abi.encode, which pads everything to 32 bytes.
    // 4 arguments = 128 bytes.
    // But the assembly code copies 0x60 = 96 bytes.
    // This means it's missing the last 32 bytes? Or the logic in Account.sol expects 3 params?
    
    // Account.sol: abi.decode(footer, (uint256, address, uint256)); -> chainId, tokenContract, tokenId
    // It decodes 3 items.
    // Registry encodes: salt, chainId, tokenContract, tokenId (4 items)
    
    // If Registry appends: [salt][chainId][tokenContract][tokenId]
    // And Account reads 96 bytes from offset 55...
    // The PROXY code is exactly 55 bytes long.
    // So it reads the first 96 bytes of the footer.
    // Footer = [salt (32)] [chainId (32)] [tokenContract (32)] ... [tokenId (32)]
    // It reads: salt, chainId, tokenContract.
    // It decodes them as: chainId, tokenContract, tokenId.
    
    // MISMATCH!
    // Account expects: [chainId, tokenContract, tokenId]
    // Registry provides: [salt, chainId, tokenContract, tokenId]
    
    // So Account reads 'salt' as 'chainId'.
    // Account reads 'chainId' as 'tokenContract'.
    // Account reads 'tokenContract' as 'tokenId'.
    
    // This explains why chainId was 0 (salt is usually 0).
    // This explains why tokenContract was 0x...2105 (chainId 8453 is 0x2105).
    // This explains why tokenId was the token contract address.
    
    console.log('--- DIAGNOSIS ---')
    console.log('Registry encodes 4 args: salt, chainId, tokenContract, tokenId')
    console.log('Account decodes 3 args: chainId, tokenContract, tokenId')
    console.log('The Account reads the first 3 args of the footer, which are: salt, chainId, tokenContract')
    console.log('Resulting mapping:')
    console.log('  Account.chainId = Registry.salt')
    console.log('  Account.tokenContract = Registry.chainId')
    console.log('  Account.tokenId = Registry.tokenContract')
}

debugBytecode()
