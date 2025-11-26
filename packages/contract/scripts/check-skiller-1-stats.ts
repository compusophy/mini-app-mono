
import { ethers } from "hardhat";

async function main() {
  const diamondAddress = "0x18b07310912692c44a002304b3ea198315d49396";
  const skillerId = 1;

  console.log("--- FETCHING ON-CHAIN DATA FOR SKILLER #1 ---");

  // 1. Get Contracts
  const gameFacet = await ethers.getContractAt("GameFacet", diamondAddress);
  const itemsFacet = await ethers.getContractAt("SkillerItemsV2", "0xfaf43c38b8608345e45e16952c3cc89a1d520a2e");
  
  // 2. Get Basic Info
  // Calculate TBA manually as helper is internal
  const registryAddress = "0xd88ff2769292646d65c3a8e9dbcbf341564f76f7";
  const accountImpl = "0x7539d350b54fa05aa221ec2c541c5509230d4abc";
  const profileV2Address = "0x5e49981495330098327d8e0cf23d45213314273b";
  const chainId = 8453;
  const salt = 0;

  const registry = await ethers.getContractAt("IERC6551Registry", registryAddress);
  const tba = await registry.account(accountImpl, salt, chainId, profileV2Address, skillerId);

  console.log(`Skiller #${skillerId} TBA: ${tba}`);

  // 3. Get Mining Level (Skill 1)
  const xp = await gameFacet.getXP(skillerId, 1);
  const level = Math.floor(Math.cbrt(Number(xp) / 20)) + 1;
  console.log(`Mining XP: ${xp}, Level: ${level}`);

  // 4. Get Items
  const IRON_PICKAXE = 152;
  const MINING_CHARM = 401;
  
  const ironPickaxeBal = await itemsFacet.balanceOf(tba, IRON_PICKAXE);
  const charmBal = await itemsFacet.balanceOf(tba, MINING_CHARM);

  console.log(`Iron Pickaxe Balance: ${ironPickaxeBal}`);
  console.log(`Mining Charm Balance: ${charmBal}`);

  console.log("\n--- SCENARIO CALCULATION ---");
  console.log("Parameters: Level 21, Iron Pickaxe, 6 Charms");

  // Logic from MiningFacet.sol
  // Base
  let amount = 1;
  let xpGain = 10;

  // Iron Pickaxe Effect
  // if (ironPick > 0) -> amount = 10, xp = 100
  amount = 10;
  xpGain = 100;

  // Charm Multiplier
  // amount = amount * (1 + charmCount)
  // xp = xp * (1 + charmCount)
  const charmCount = 6;
  const charmMultiplier = 1 + charmCount;
  
  amount = amount * charmMultiplier;
  xpGain = xpGain * charmMultiplier;

  console.log(`After Charm Multiplier (${charmMultiplier}x): Amount=${amount}, XP=${xpGain}`);

  // Level Multiplier
  // amount = amount * level
  // xp = xp * level
  const targetLevel = 21;
  
  amount = amount * targetLevel;
  xpGain = xpGain * targetLevel;

  console.log(`After Level Multiplier (${targetLevel}x): Amount=${amount}, XP=${xpGain}`);
  console.log(`\nFINAL RESULT: +${amount} Iron Ore, +${xpGain} XP`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
