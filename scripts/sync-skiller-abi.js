const fs = require('fs');
const path = require('path');

const artifactsDir = path.join(__dirname, '../packages/contract/artifacts/contracts');
const frontendDir = path.join(__dirname, '../packages/frontend/src/lib');

const contracts = [
    { name: 'ERC6551Registry', path: 'ERC6551Registry.sol/ERC6551Registry.json' },
    { name: 'ERC6551Account', path: 'ERC6551Account.sol/ERC6551Account.json' },
    { name: 'SkillerProfile', path: 'SkillerProfile.sol/SkillerProfile.json' },
    { name: 'SkillerItemsV2', path: 'tokens/SkillerItemsV2.sol/SkillerItemsV2.json' },
    { name: 'SkillerProfileV2', path: 'SkillerProfile.sol/SkillerProfile.json' }, // Assuming V2 uses same artifact or updated one
    { name: 'GameDiamond', path: 'diamond/Diamond.sol/Diamond.json' }, // Diamond serves as the main interface for facets
    { name: 'GameFacet', path: 'facets/GameFacet.sol/GameFacet.json' }, // Individual facets might be needed for generating correct interface if Diamond artifact is empty of facet methods
    { name: 'MiningFacet', path: 'facets/MiningFacet.sol/MiningFacet.json' },
    { name: 'WoodcuttingFacet', path: 'facets/WoodcuttingFacet.sol/WoodcuttingFacet.json' },
    { name: 'StatsFacet', path: 'facets/StatsFacet.sol/StatsFacet.json' },
    { name: 'QuestFacet', path: 'facets/QuestFacet.sol/QuestFacet.json' },
    { name: 'ShopFacet', path: 'facets/ShopFacet.sol/ShopFacet.json' },
    { name: 'VoidFacet', path: 'facets/VoidFacet.sol/VoidFacet.json' },
    { name: 'CraftingFacet', path: 'facets/CraftingFacet.sol/CraftingFacet.json' }
];

const abis = {};

// Helper to merge ABIs for Diamond
const diamondAbi = [];

contracts.forEach(contract => {
    try {
        const artifactPath = path.join(artifactsDir, contract.path);
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // For Diamond, we want to merge all facet ABIs into one "GameDiamond" ABI for the frontend
        if (contract.name.includes('Facet') || contract.name === 'GameDiamond') {
             artifact.abi.forEach(item => {
                 // Avoid duplicates
                 const sig = JSON.stringify(item);
                 if (!diamondAbi.some(existing => JSON.stringify(existing) === sig)) {
                     diamondAbi.push(item);
                 }
             });
        }
        
        abis[contract.name] = artifact.abi;
        console.log(`Loaded ABI for ${contract.name}`);
    } catch (error) {
        console.error(`Error loading ABI for ${contract.name}:`, error.message);
    }
});

// Override GameDiamond with the merged one
abis['GameDiamond'] = diamondAbi;

const content = `export const ABIS = ${JSON.stringify(abis, null, 2)} as const;`;
fs.writeFileSync(path.join(frontendDir, 'abis.ts'), content);
console.log('ABIs synced to packages/frontend/src/lib/abis.ts');

