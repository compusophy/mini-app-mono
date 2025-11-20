const fs = require('fs');
const path = require('path');

const artifactsDir = path.join(__dirname, '../packages/contract/artifacts/contracts');
const frontendDir = path.join(__dirname, '../packages/frontend/src/lib');

const contracts = [
    { name: 'ERC6551Registry', path: 'ERC6551Registry.sol/ERC6551Registry.json' },
    { name: 'ERC6551Account', path: 'ERC6551Account.sol/ERC6551Account.json' },
    { name: 'SkillerProfile', path: 'SkillerProfile.sol/SkillerProfile.json' },
    { name: 'SkillerItems', path: 'SkillerItems.sol/SkillerItems.json' },
    { name: 'SkillerChopping', path: 'SkillerChopping.sol/SkillerChopping.json' },
    { name: 'SkillerDescriptor', path: 'SkillerDescriptor.sol/SkillerDescriptor.json' }
];

const abis = {};

contracts.forEach(contract => {
    try {
        const artifactPath = path.join(artifactsDir, contract.path);
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        abis[contract.name] = artifact.abi;
        console.log(`Loaded ABI for ${contract.name}`);
    } catch (error) {
        console.error(`Error loading ABI for ${contract.name}:`, error.message);
    }
});

const content = `export const ABIS = ${JSON.stringify(abis, null, 2)} as const;`;
fs.writeFileSync(path.join(frontendDir, 'abis.ts'), content);
console.log('ABIs synced to packages/frontend/src/lib/abis.ts');

