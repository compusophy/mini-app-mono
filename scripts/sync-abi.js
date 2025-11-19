const fs = require('fs');
const path = require('path');

const contractArtifactPath = path.join(__dirname, '../packages/contract/artifacts/contracts/Greeter.sol/Greeter.json');
const frontendContractPath = path.join(__dirname, '../packages/frontend/src/lib/contract.ts');

try {
    const artifact = JSON.parse(fs.readFileSync(contractArtifactPath, 'utf8'));
    const abi = artifact.abi;
    
    // Read existing frontend file to preserve address if possible, or just overwrite
    // For simplicity, I will just regenerate the file content with the new ABI and a placeholder or existing address.
    
    let currentContent = '';
    if (fs.existsSync(frontendContractPath)) {
        currentContent = fs.readFileSync(frontendContractPath, 'utf8');
    }
    
    const addressMatch = currentContent.match(/export const contractAddress = "(.*?)";/);
    const address = addressMatch ? addressMatch[1] : "0x0000000000000000000000000000000000000000";

    const newContent = `export const contractAddress = "${address}"; // Replace with deployed address

export const contractABI = ${JSON.stringify(abi, null, 2)} as const;
`;

    fs.writeFileSync(frontendContractPath, newContent);
    console.log('ABI synced to frontend!');
} catch (error) {
    console.error('Error syncing ABI:', error);
    process.exit(1);
}

