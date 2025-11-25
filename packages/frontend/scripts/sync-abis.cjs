const fs = require('fs');
const path = require('path');

const CONTRACTS_DIR = path.resolve(__dirname, '../../contract/artifacts/contracts');
const OUT_FILE = path.resolve(__dirname, '../src/lib/abis.ts');
const V1_FILE = path.resolve(__dirname, '../src/lib/abis-v1.json');

const ARTIFACTS = {
    'SkillerProfileV2': 'tokens/SkillerProfileV2.sol/SkillerProfileV2.json',
    'SkillerItemsV2': 'tokens/SkillerItemsV2.sol/SkillerItemsV2.json',
    'SkillerMigration': 'migration/SkillerMigration.sol/SkillerMigration.json',
    'WoodcuttingFacet': 'facets/WoodcuttingFacet.sol/WoodcuttingFacet.json',
    'MiningFacet': 'facets/MiningFacet.sol/MiningFacet.json',
    'CraftingFacet': 'facets/CraftingFacet.sol/CraftingFacet.json',
    'StatsFacet': 'facets/StatsFacet.sol/StatsFacet.json',
    'ShopFacet': 'facets/ShopFacet.sol/ShopFacet.json',
    'QuestFacet': 'facets/QuestFacet.sol/QuestFacet.json',
    'VoidFacet': 'facets/VoidFacet.sol/VoidFacet.json',
    'Diamond': 'diamond/Diamond.sol/Diamond.json',
    
    // V1 Contracts that exist in artifacts
    'SkillerProfile': 'SkillerProfile.sol/SkillerProfile.json',
    'SkillerItems': 'SkillerItems.sol/SkillerItems.json',
    'SkillerChopping': 'SkillerChopping.sol/SkillerChopping.json',
    'SkillerDescriptor': 'SkillerDescriptor.sol/SkillerDescriptor.json',
    'ERC6551Registry': 'ERC6551Registry.sol/ERC6551Registry.json',
    'ERC6551Account': 'ERC6551Account.sol/ERC6551Account.json',
};

// Helper to read ABI
function readAbi(relativePath) {
    try {
        const fullPath = path.join(CONTRACTS_DIR, relativePath);
        if (!fs.existsSync(fullPath)) {
            console.warn(`Warning: File not found ${fullPath}`);
            return [];
        }
        const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return json.abi;
    } catch (e) {
        console.error(`Error reading ${relativePath}:`, e);
        return [];
    }
}

// Combine Facet ABIs into a single "GameDiamond" ABI
const woodcuttingAbi = readAbi(ARTIFACTS['WoodcuttingFacet']);
const miningAbi = readAbi(ARTIFACTS['MiningFacet']);
const craftingAbi = readAbi(ARTIFACTS['CraftingFacet']);
const statsAbi = readAbi(ARTIFACTS['StatsFacet']);
const shopAbi = readAbi(ARTIFACTS['ShopFacet']);
const questAbi = readAbi(ARTIFACTS['QuestFacet']);
const voidAbi = readAbi(ARTIFACTS['VoidFacet']);

// Merge arrays, filtering duplicates? Or just concat. Ethers handles overload.
const gameDiamondAbi = [
    ...woodcuttingAbi, 
    ...miningAbi, 
    ...craftingAbi,
    ...statsAbi,
    ...shopAbi,
    ...questAbi,
    ...voidAbi
];

// Load V1 fallback
let v1Abis = {};
if (fs.existsSync(V1_FILE)) {
    v1Abis = JSON.parse(fs.readFileSync(V1_FILE, 'utf8'));
}

// Build the output object
const abis = {
    ...v1Abis, // Start with V1 fallbacks (SkillerMining, SkillerGold)
    
    SkillerProfileV2: readAbi(ARTIFACTS['SkillerProfileV2']),
    SkillerItemsV2: readAbi(ARTIFACTS['SkillerItemsV2']),
    SkillerMigration: readAbi(ARTIFACTS['SkillerMigration']),
    GameDiamond: gameDiamondAbi,
    
    SkillerProfile: readAbi(ARTIFACTS['SkillerProfile']),
    SkillerItems: readAbi(ARTIFACTS['SkillerItems']),
    SkillerChopping: readAbi(ARTIFACTS['SkillerChopping']),
    SkillerDescriptor: readAbi(ARTIFACTS['SkillerDescriptor']),
    
    ERC6551Registry: readAbi(ARTIFACTS['ERC6551Registry']),
    ERC6551Account: readAbi(ARTIFACTS['ERC6551Account']),
};

// Generate TS file
const content = `export const ABIS = ${JSON.stringify(abis, null, 2)} as const;`;

fs.writeFileSync(OUT_FILE, content);
console.log(`Wrote ABIs to ${OUT_FILE}`);
