import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as path from "path";
import * as fs from "fs";

// Load env vars manually - handle UTF-16 encoding
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  let envContent: string;
  // Try UTF-16 first (Windows often saves as UTF-16)
  try {
    const buffer = fs.readFileSync(envPath);
    // Check for UTF-16 BOM
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      // UTF-16 LE
      envContent = buffer.slice(2).toString('utf16le').replace(/\0/g, '');
    } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      // UTF-16 BE (unlikely but handle it)
      throw new Error('UTF-16 BE not supported, please save as UTF-8');
    } else {
      // Try UTF-8
      envContent = buffer.toString('utf-8');
    }
  } catch (e) {
    // Fallback to UTF-8
    envContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    }
  }
}

// Debug: Check if PRIVATE_KEY is loaded
if (!process.env.PRIVATE_KEY) {
  console.warn(`Warning: PRIVATE_KEY not found in environment. Checked: ${envPath}`);
} else {
  console.log(`✓ PRIVATE_KEY loaded successfully (length: ${process.env.PRIVATE_KEY.length} chars)`);
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "base-mainnet": {
      url: "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
      gasPrice: 40000000, // Increase to 0.04 gwei to beat stuck txs
    },
  },
};

export default config;
