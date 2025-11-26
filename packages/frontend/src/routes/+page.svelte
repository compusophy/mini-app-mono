<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { sdk } from '@farcaster/miniapp-sdk';
  import { config } from '$lib/wagmi';
  import { connect, getAccount, watchAccount, getWalletClient, getPublicClient } from '@wagmi/core';
  import { encodeFunctionData, type Address } from 'viem';
  import { ABIS } from '$lib/abis';
  import addresses from '$lib/addresses.json';
  import { APP_VERSION } from '$lib/version';
  import { Backpack, User, Axe, Pickaxe, Coins, TreeDeciduous, Mountain, ArrowLeft, BarChart3, Trophy, RefreshCw, Hammer, Trash2, Copy, HelpCircle, Send, Store, Gem } from '@lucide/svelte';

  const CONTRACT_ADDRESSES = addresses;

  // Types
  type Profile = {
    id: bigint;
    image: string;
    tba: Address;
    axeBalance: bigint;
    woodBalance: bigint;
    pickaxeBalance: bigint;
    oreBalance: bigint;
    goldBalance: bigint;
    miningLevel: bigint;
    miningXp: bigint;
    woodcuttingLevel: bigint;
    woodcuttingXp: bigint;
    version: 'v1' | 'v2';
    ironAxeBalance?: bigint;
    ironPickaxeBalance?: bigint;
    ironOreBalance?: bigint;
    coalOreBalance?: bigint;
    miningCharm?: bigint;
    woodcuttingCharm?: bigint;
    goldCharm?: bigint;
    tbaBalance?: bigint; // Native ETH balance of TBA
    voidLevel?: bigint;
  };

  // State
  let account: Address | null = null;
  let accountBalance: bigint = 0n;
  let profiles: Profile[] = [];
  let selectedProfileId: bigint | null = null;
  
  // Version Check State
  let isVersionValid = true;
  let clientVersion = APP_VERSION;
  
  let loading = false;
  let isLoadingProfiles = false;
  let isInitializing = true;
  
  // Modals
  let showInventory = false;
  let showProfile = false;
  let showSkills = false;
  let showCrafting = false;
  let showQuests = false;
  let showShop = false;
  let showSendModal = false;
  let showLeaderboard = false;

  let leaderboardData: { tokenId: bigint, level: bigint }[] = [];
  let voidCost = 0n;

  let errorMsg: string | null = null;
  
  // Send Logic
  let sendRecipientId = '';
  let sendAmount = '1';

    type Toast = {
    id: number;
    msg: string;
    type: 'default' | 'woodcutting-xp' | 'mining-xp' | 'inventory' | 'error' | 'item-received' | 'level-up' | 'item-log' | 'item-ore' | 'item-gold' | 'item-wood-charm' | 'item-mine-charm';
  };
  let toasts: Toast[] = [];
  let toastIdCounter = 0;
  
  let actionLoading: string | null = null; 

  // Burn Logic
  let showBurnConfirmation = false;
  let showFundConfirmation = false;
  let burnConfirmationInput = '';
    let isBurning = false;
    let isFunding = false;
    let isDraining = false;

    let selectedItem: { id: bigint, name: string, balance: bigint } | null = null;

  // Derived
  $: selectedProfile = selectedProfileId !== null ? profiles.find(p => p.id === selectedProfileId) : null;

    function toggleModal(modal: 'inventory' | 'profile' | 'skills' | 'quests' | 'leaderboard' | 'shop' | 'crafting') {
        // If the target is already open, close it
        if (modal === 'inventory' && showInventory) { showInventory = false; return; }
        if (modal === 'profile' && showProfile) { showProfile = false; return; }
        if (modal === 'skills' && showSkills) { showSkills = false; return; }
        if (modal === 'quests' && showQuests) { showQuests = false; return; }
        if (modal === 'leaderboard' && showLeaderboard) { showLeaderboard = false; return; }
        if (modal === 'shop' && showShop) { showShop = false; return; }
        if (modal === 'crafting' && showCrafting) { showCrafting = false; return; }

        // Close all others
        closeAllModals();

        // Open target
        if (modal === 'inventory') showInventory = true;
        if (modal === 'profile') showProfile = true;
        if (modal === 'skills') showSkills = true;
        if (modal === 'quests') showQuests = true;
        if (modal === 'leaderboard') showLeaderboard = true;
        if (modal === 'shop') showShop = true;
        if (modal === 'crafting') showCrafting = true;
    }

    function closeAllModals() {
        showInventory = false;
        showProfile = false;
        showSkills = false;
        showQuests = false;
        showLeaderboard = false;
        showShop = false;
        showCrafting = false;
        // Also close details
        selectedItem = null; 
        showBurnConfirmation = false;
        showFundConfirmation = false;
    }

  function calculateProgress(currentXp: bigint): { percent: number, current: number, next: number, level: number } {
      const xp = Number(currentXp);
      
      // Cubic Scaling: XP = 20 * (Level-1)^3
      // Level = cbrt(xp / 20) + 1
      
      if (xp < 0) return { percent: 0, current: 0, next: 20, level: 1 }; // Level 2 at 20 XP

      let currentLevel = Math.floor(Math.cbrt(xp / 20)) + 1;
      
      if (currentLevel >= 200) {
          currentLevel = 200;
          return { percent: 100, current: xp, next: xp, level: 200 };
      }

      const currentLevelXp = 20 * Math.pow(currentLevel - 1, 3);
      const nextLevelXp = 20 * Math.pow(currentLevel, 3);

      const levelProgress = xp - currentLevelXp;
      const levelTotal = nextLevelXp - currentLevelXp;
      
      if (levelTotal <= 0) return { percent: 0, current: xp, next: nextLevelXp, level: currentLevel };
      
      return { percent: Math.min(100, Math.max(0, (levelProgress / levelTotal) * 100)), current: xp, next: nextLevelXp, level: currentLevel };
  }

  function formatRsNumber(value: number | bigint): string {
      const num = Number(value);
      if (num >= 10000000) { // 10M+
          return Math.floor(num / 1000000) + 'M';
      }
      if (num >= 100000) { // 100K+
          return Math.floor(num / 1000) + 'K';
      }
      return num.toLocaleString(); // Adds commas for < 100k
  }

  function formatInventoryNumber(value: number | bigint): string {
    const num = Number(value);
    if (num >= 10000000) { // 10M+
        return Math.floor(num / 1000000) + 'M';
    }
    if (num >= 100000) { // 100K+ for inventory items
        return Math.floor(num / 1000) + 'K';
    }
    return num.toLocaleString();
  }

  function truncateAddress(addr: string) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Address copied!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function showToast(msg: string, type: Toast['type'] = 'default') {
      const id = toastIdCounter++;
      toasts = [...toasts, { id, msg, type }];
      setTimeout(() => {
          toasts = toasts.filter(t => t.id !== id);
      }, 3000);
  }

  onMount(async () => {
    let isMounted = true;
    
    try {
        await sdk.actions.ready();
    } catch (e) {
        console.log("Not in Mini App environment or SDK error:", e);
    }

    // VERSION CHECK
    const checkVersion = async () => {
        try {
            // Cache-busting unique query param
            const res = await fetch(`/version.json?t=${new Date().getTime()}`);
            if (res.ok) {
                const data = await res.json();
                // Only force reload if Server is NEWER than Client
                // Simple string comparison works for now (1.2.0 > 1.1.0)
                // Ideally use semver compare
                if (data.version !== APP_VERSION) {
                    // Check if server is actually newer
                    const serverParts = data.version.split('.').map(Number);
                    const clientParts = APP_VERSION.split('.').map(Number);
                    
                    let serverIsNewer = false;
                    for (let i = 0; i < 3; i++) {
                        if (serverParts[i] > clientParts[i]) {
                            serverIsNewer = true;
                            break;
                        } else if (serverParts[i] < clientParts[i]) {
                            break; // Client is newer (dev/preview), don't reload
                        }
                    }

                    if (serverIsNewer) {
                        isVersionValid = false;
                        console.warn(`Version mismatch! Client: ${APP_VERSION}, Server: ${data.version} (Update Required)`);
                    } else {
                        console.log(`Client (${APP_VERSION}) is ahead or equal to Server (${data.version}). No reload.`);
                    }
                }
            }
        } catch (e) {
            console.error("Version check failed", e);
        }
    };
    
    // Check immediately
    await checkVersion();
    
    // Check every minute
    const versionInterval = setInterval(checkVersion, 60000);

    watchAccount(config, {
        onChange(data) {
            if (!isMounted) return;
            const prevAccount = account;
            account = data.address ?? null;
            if (account && account !== prevAccount) {
                loadProfiles();
                // Fetch account balance
                getPublicClient(config)?.getBalance({ address: account }).then(b => accountBalance = b);
            }
        }
    });

    // Mini App Auto-Connect logic
    try {
        const isMiniApp = await sdk.isInMiniApp();
        if (isMiniApp && isMounted) {
            const currentAccount = getAccount(config);
            if (currentAccount.address) {
                account = currentAccount.address;
                const pc = getPublicClient(config);
                if (pc) pc.getBalance({ address: account }).then(b => accountBalance = b);
                await loadProfiles();
            } else {
                try {
                    await connect(config, { connector: config.connectors[0] });
                } catch (e) {
                    console.log("Auto-connect skipped:", e);
                }
            }
        }
    } catch (e) {
        console.log("Mini App check failed:", e);
    } finally {
        isInitializing = false;
    }
    
    return () => {
        isMounted = false;
        clearInterval(versionInterval);
    };
  });

  async function loadProfiles(silent = false) {
    if (!account) return;
    const publicClient = getPublicClient(config);
    if (!publicClient) return;

    if (!silent) isLoadingProfiles = true;
    errorMsg = null;

    try {
        const loadedProfiles: Profile[] = [];

        // 1. Load V1 Profiles
        if (CONTRACT_ADDRESSES.SkillerProfile) {
            const balanceV1 = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'balanceOf',
                args: [account]
            });

            for (let i = 0n; i < balanceV1; i++) {
                try {
                    const tokenId = await publicClient.readContract({
                        address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                        abi: ABIS.SkillerProfile,
                        functionName: 'tokenOfOwnerByIndex',
                        args: [account, i]
                    });
                    const profileData = await getProfileData(tokenId, publicClient, 'v1');
                    loadedProfiles.push(profileData);
                } catch (e: any) {
                    if (e.message?.includes('ERC721OutOfBoundsIndex') || e.message?.includes('out of bounds')) {
                        console.warn("Caught V1 index out of bounds (stale balance?), stopping loop.");
                        break;
                    }
                    throw e;
                }
            }
        }

        // 2. Load V2 Profiles
        if (CONTRACT_ADDRESSES.SkillerProfileV2) {
            const balanceV2 = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerProfileV2 as Address,
                abi: ABIS.SkillerProfileV2,
                functionName: 'balanceOf',
                args: [account]
            });

            for (let i = 0n; i < balanceV2; i++) {
                try {
                    const tokenId = await publicClient.readContract({
                        address: CONTRACT_ADDRESSES.SkillerProfileV2 as Address,
                        abi: ABIS.SkillerProfileV2,
                        functionName: 'tokenOfOwnerByIndex',
                        args: [account, i]
                    });
                    const profileData = await getProfileData(tokenId, publicClient, 'v2');
                    loadedProfiles.push(profileData);
                } catch (e: any) {
                     if (e.message?.includes('ERC721OutOfBoundsIndex') || e.message?.includes('out of bounds')) {
                        console.warn("Caught V2 index out of bounds (stale balance?), stopping loop.");
                        break;
                    }
                    throw e;
                }
            }
        }

        profiles = loadedProfiles;
    } catch (e) {
        console.error("Error loading profiles:", e);
        errorMsg = `Failed to load profiles: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        if (!silent) isLoadingProfiles = false;
    }
  }

  async function getProfileData(tokenId: bigint, publicClient: any, version: 'v1' | 'v2'): Promise<Profile> {
    const chainIdFromNetwork = await publicClient.getChainId();
    
    const profileAddress = version === 'v1' ? CONTRACT_ADDRESSES.SkillerProfile : CONTRACT_ADDRESSES.SkillerProfileV2;
    
    const tbaAddress = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
        abi: ABIS.ERC6551Registry,
        functionName: 'account',
        args: [
            CONTRACT_ADDRESSES.ERC6551Account as Address,
            0n,
            BigInt(chainIdFromNetwork),
            profileAddress as Address,
            tokenId
        ]
    });

    let axeBalance = 0n;
    let woodBalance = 0n;
    let pickaxeBalance = 0n;
    let oreBalance = 0n;
    let goldBalance = 0n;
    
    let ironAxeBalance = 0n;
    let ironPickaxeBalance = 0n;
    let ironOreBalance = 0n;
    let coalOreBalance = 0n;
    
    let miningCharm = 0n;
    let woodcuttingCharm = 0n;
    let goldCharm = 0n;

    let miningLevel = 1n;
    let miningXp = 0n;
    let woodcuttingLevel = 1n;
    let woodcuttingXp = 0n;
    let voidLevel = 0n;
    let tbaBalance = 0n;

    try {
        // Get TBA Balance
        tbaBalance = await publicClient.getBalance({ address: tbaAddress });

        const itemsAddress = version === 'v1' ? CONTRACT_ADDRESSES.SkillerItems : CONTRACT_ADDRESSES.SkillerItemsV2;
        const itemsAbi = version === 'v1' ? ABIS.SkillerItems : ABIS.SkillerItemsV2;

        if (itemsAddress) {
            const promises = [
                publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 101n] }), // Bronze Axe
                publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 201n] }), // Oak Log
                publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 151n] }), // Bronze Pickaxe
                publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 301n] }), // Iron Ore (V2) / Copper Ore (V1)
            ];

            if (version === 'v2') {
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 102n] })); // Iron Axe
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 152n] })); // Iron Pickaxe
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 301n] })); // Iron Ore (Redundant)
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 302n] })); // Coal Ore
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 1n] })); // Gold
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 401n] })); // Mining Charm
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 402n] })); // Woodcutting Charm
                promises.push(publicClient.readContract({ address: itemsAddress as Address, abi: itemsAbi, functionName: 'balanceOf', args: [tbaAddress, 403n] })); // Gold Charm
            } else {
                 if (CONTRACT_ADDRESSES.SkillerGold) {
                     // Simplified V1 Gold handling
                 }
            }

            const results = await Promise.all(promises);
            axeBalance = results[0] as bigint;
            woodBalance = results[1] as bigint;
            pickaxeBalance = results[2] as bigint;
            oreBalance = results[3] as bigint;

            if (version === 'v2') {
                ironAxeBalance = results[4] as bigint;
                ironPickaxeBalance = results[5] as bigint;
                ironOreBalance = results[6] as bigint;
                coalOreBalance = results[7] as bigint;
                goldBalance = results[8] as bigint;
                miningCharm = results[9] as bigint;
                woodcuttingCharm = results[10] as bigint;
                goldCharm = results[11] as bigint;
            }
        }

        if (version === 'v1') {
             if (CONTRACT_ADDRESSES.SkillerMining) {
                miningLevel = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerMining as Address,
                    abi: ABIS.SkillerMining,
                    functionName: 'getLevel',
                    args: [tokenId]
                });
                miningXp = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerMining as Address,
                    abi: ABIS.SkillerMining,
                    functionName: 'profileXp',
                    args: [tokenId]
                });
            }
            if (CONTRACT_ADDRESSES.SkillerChopping) {
                woodcuttingLevel = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerChopping as Address,
                    abi: ABIS.SkillerChopping,
                    functionName: 'getLevel',
                    args: [tokenId]
                });
                woodcuttingXp = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerChopping as Address,
                    abi: ABIS.SkillerChopping,
                    functionName: 'profileXp',
                    args: [tokenId]
                });
            }
        } else {
            // V2 Stats from Diamond (GameFacet)
            try {
                const stats: any = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.Diamond as Address,
                    abi: ABIS.GameDiamond,
                    functionName: 'getStats',
                    args: [tokenId]
                });
                    // stats is [miningXp, miningLevel, woodcuttingXp, woodcuttingLevel]
                if (stats && stats.length >= 4) {
                    miningXp = stats[0];
                    woodcuttingXp = stats[2];
                    
                    // Use contract levels directly if possible to avoid JS calc mismatches
                    miningLevel = stats[1];
                    woodcuttingLevel = stats[3];

                    // Just in case contract returns 0 for level (shouldn't happen if XP > 0)
                    if (miningLevel === 0n && miningXp > 0n) {
                        miningLevel = BigInt(calculateProgress(miningXp).level);
                    }
                    if (woodcuttingLevel === 0n && woodcuttingXp > 0n) {
                        woodcuttingLevel = BigInt(calculateProgress(woodcuttingXp).level);
                    }
                } else if (stats && stats.length === 2) {
                     // Fallback for older ABI if somehow cached?
                    miningXp = stats[0];
                    woodcuttingXp = stats[1];
                    const mXp = Number(miningXp);
                    const wXp = Number(woodcuttingXp);
                    miningLevel = BigInt(calculateProgress(BigInt(mXp)).level);
                    woodcuttingLevel = BigInt(calculateProgress(BigInt(wXp)).level);
                }

                // Fetch Void Level
                try {
                    voidLevel = await publicClient.readContract({
                        address: CONTRACT_ADDRESSES.Diamond as Address,
                        abi: ABIS.GameDiamond,
                        functionName: 'getVoidLevel',
                        args: [tokenId]
                    }) as bigint;
                } catch (e) {
                    console.warn("Could not read Void level:", e);
                }

            } catch (e) {
                console.warn("Could not read V2 stats (contract update pending?)", e);
            }
        }

    } catch (e) {
        console.error(`Error reading ${version} data:`, e);
    }

    return {
        id: tokenId,
        image: '',
        tba: tbaAddress,
        axeBalance,
        woodBalance,
        pickaxeBalance,
        oreBalance,
        goldBalance,
        miningLevel,
        miningXp,
        woodcuttingLevel,
        woodcuttingXp,
        version,
        ironAxeBalance,
        ironPickaxeBalance,
        ironOreBalance,
        coalOreBalance,
        tbaBalance,
        miningCharm,
        woodcuttingCharm,
        goldCharm,
        voidLevel
    };
  }

  async function fetchLeaderboard() {
      if (!showLeaderboard) return;
      
      const publicClient = getPublicClient(config);
      try {
          const data = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.Diamond as Address,
              abi: ABIS.GameDiamond,
              functionName: 'getLeaderboard',
              args: []
          }) as { tokenId: bigint, level: bigint }[];
          
          // Filter out empty entries and sort descending (contract should keep sorted but safe to ensure)
          // Failsafe filter out ghost Skiller #32 ONLY (Level 100+ is valid for real players)
          leaderboardData = [...data]
              .filter(entry => entry.level > 0n)
              .filter(entry => entry.tokenId !== 32n)
              .sort((a, b) => Number(b.level - a.level));
              
          // Fetch Cost for user
          if (selectedProfile) {
              voidCost = await publicClient.readContract({
                  address: CONTRACT_ADDRESSES.Diamond as Address,
                  abi: ABIS.GameDiamond,
                  functionName: 'getVoidCost',
                  args: [selectedProfile.id]
              }) as bigint;
          }
      } catch (e) {
          console.error("Failed to fetch leaderboard:", e);
      }
  }

  $: if (showLeaderboard) {
      fetchLeaderboard();
  }

  async function handleSacrifice() {
      if (!selectedProfile || !account || actionLoading) return;
      
      // Double check balance before starting
      if ((selectedProfile.woodBalance || 0n) < voidCost || (selectedProfile.ironOreBalance || 0n) < voidCost) {
          return; // Button should be disabled anyway
      }

      actionLoading = 'sacrifice';
      
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.Diamond as Address,
            abi: ABIS.GameDiamond,
            functionName: 'sacrificeToVoid',
            args: [selectedProfile.id]
        });
        
        const hash = await walletClient.writeContract(request);
        showToast('The Void Hungers...');
        
        // Optimistic Update: Manually reduce balance for immediate feedback
        if (selectedProfile) {
            // Create a NEW object to ensure reactivity triggers
            const updatedProfile = { ...selectedProfile };
            
            updatedProfile.woodBalance = (updatedProfile.woodBalance || 0n) - voidCost;
            updatedProfile.ironOreBalance = (updatedProfile.ironOreBalance || 0n) - voidCost;
            
            // Optimistically update Void Level
            const currentLevel = updatedProfile.voidLevel || 0n;
            const nextLevel = currentLevel + 1n;
            updatedProfile.voidLevel = nextLevel;
            
            // Update Cost for next level
            const targetLevel = nextLevel + 1n;
            voidCost = 100n * (targetLevel * targetLevel);

            // Update the profiles array with the new object
            profiles = profiles.map(p => p.id === updatedProfile.id ? updatedProfile : p);
            
            // IMPORTANT: Also update selectedProfile manually if the reactive binding is slow or disconnected
            selectedProfile = updatedProfile;
        }

        await publicClient.waitForTransactionReceipt({ hash });
        
        showToast('Sacrifice Accepted!', 'level-up');
        await loadProfiles(true);
        await fetchLeaderboard(); // Refresh board
        
      } catch (e: any) {
          console.error("Sacrifice failed:", e);
          // Clean error message
          let msg = e.message || "Unknown Error";
          
          // Catch contract revert for incorrect logic or outdated ABI params
          if (msg.includes("execution reverted") || msg.includes("contract runner does not support")) {
              msg = "Transaction failed. Please reload.";
              // Force check version on critical failure
              checkVersion();
          }
          else if (msg.includes("The Void demands more Logs")) msg = "Not enough Oak Logs";
          else if (msg.includes("The Void demands more Ore")) msg = "Not enough Iron Ore";
          else if (msg.includes("User rejected")) msg = "Transaction Cancelled";
          else if (msg.length > 50) msg = "Sacrifice Failed"; // Fallback for long RPC errors
          
          showToast(msg, 'error');
          
          // Revert optimistic update if it failed (reload profile)
          await loadProfiles(true);
      } finally {
          actionLoading = null;
      }
  }

  async function refreshCurrentProfile() {
      if (!selectedProfile || !account) return;
      
      actionLoading = 'refresh-profile';
      
      try {
          const publicClient = getPublicClient(config);
          const freshProfile = await getProfileData(selectedProfile.id, publicClient, selectedProfile.version);
          
          // Update the specific profile in the array
          profiles = profiles.map(p => p.id === freshProfile.id ? freshProfile : p);
          
          showToast('Profile Updated', 'inventory');
      } catch (e) {
          console.error("Refresh failed:", e);
          showToast("Failed to refresh", 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function handleMigrate(tokenId: bigint) {
      if (!account || actionLoading) return;
      actionLoading = 'migrate';
      
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        if (!walletClient || !publicClient) throw new Error("Wallet not connected");

        const approved = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'getApproved',
            args: [tokenId]
        });
        
        const migrationAddr = CONTRACT_ADDRESSES.SkillerMigration as Address;

        if (approved !== migrationAddr) {
            const { request } = await publicClient.simulateContract({
                account,
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'approve',
                args: [migrationAddr, tokenId]
            });
            const hash = await walletClient.writeContract(request);
            showToast('Approving Migration...');
            await publicClient.waitForTransactionReceipt({ hash });

            // Wait for approval to be indexed
            let retries = 0;
            while (retries < 10) {
                const newApproved = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                    abi: ABIS.SkillerProfile,
                    functionName: 'getApproved',
                    args: [tokenId]
                });
                if (newApproved === migrationAddr) break;
                await new Promise(r => setTimeout(r, 1000));
                retries++;
            }
        }

        const { request: migrateReq } = await publicClient.simulateContract({
            account,
            address: migrationAddr,
            abi: ABIS.SkillerMigration,
            functionName: 'migrate',
            args: [tokenId]
        });
        const hashMigrate = await walletClient.writeContract(migrateReq);
        showToast('Migrating to V2...');
        await publicClient.waitForTransactionReceipt({ hash: hashMigrate });
        
        showToast('Migration Complete! Welcome to V2.');
        await loadProfiles(true);
        selectedProfileId = tokenId; 

      } catch(e: any) {
          console.error("Migration failed:", e);
          showToast(`Migration failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

    // Helper for specific toasts
    function getActionToast(action: string, logs: any[], version: 'v1' | 'v2') {
        if (version === 'v1') {
            // Keep generic for V1 or implement if needed
            showToast('Action Complete!', 'inventory');
            return;
        }

        // V2 Logic parsing events
        // Expected events: Chopped(tba, logId, amount, xp), Mined(tba, oreId, amount, xp)
        // We need to find the event in logs. 
        // Note: viem logs are raw unless decoded. But wagmi might return receipt. 
        // The `waitForTransactionReceipt` returns receipt with logs.
        // For now, we can just assume success means +10 XP / +1 Item if we don't parse logs.
        // BUT the user wants specific toasts.
        // Let's try to guess based on action for now to restore UX, then improve with parsing.
        
        // Check for better tools to adjust toast message
        // Iron Axe/Pickaxe gives 10x rewards
        
        if (action === 'chop') {
            const hasIronAxe = (selectedProfile?.ironAxeBalance || 0n) > 0n;
            const hasCharm = (selectedProfile?.woodcuttingCharm);
            const currentLevel = Number(selectedProfile?.woodcuttingLevel || 1n); // Get current level
            
            // Base * Level Multiplier
            let xpBase = hasIronAxe ? 100 : 10;
            let itemBase = hasIronAxe ? 10 : 1;
            
            if (hasCharm) {
                xpBase *= 2;
                itemBase *= 2;
            }

            const xpAmount = xpBase * currentLevel;
            const itemAmount = itemBase * currentLevel;
            
            // Check for Level Up
            // Get current XP from updated profile (reload has happened)
            const newXp = Number(selectedProfile?.woodcuttingXp || 0n);
            const newLevel = calculateProgress(BigInt(newXp)).level;
            
            // We can infer if we leveled up if the previous level (which we don't have stored unless passed)
            // Alternative: Calculate level for (newXp - xpAmount). If < newLevel, we leveled up.
            const oldXp = newXp - xpAmount;
            const oldLevel = calculateProgress(BigInt(oldXp)).level;
            
            if (newLevel > oldLevel) {
                showToast(`Level Up! Woodcutting ${newLevel}`, 'level-up');
            }

            showToast(`+${xpAmount} Woodcutting XP`, 'woodcutting-xp');
            showToast(`+${itemAmount} Oak Log${itemAmount > 1 ? 's' : ''}`, 'item-log');
        } else if (action === 'mine') {
            const hasIronPickaxe = (selectedProfile?.ironPickaxeBalance || 0n) > 0n;
            const hasCharm = (selectedProfile?.miningCharm);
            const currentLevel = Number(selectedProfile?.miningLevel || 1n); // Get current level

            // Base * Level Multiplier
            let xpBase = hasIronPickaxe ? 100 : 10;
            let itemBase = hasIronPickaxe ? 10 : 1;
            
            if (hasCharm) {
                xpBase *= 2;
                itemBase *= 2;
            }

            const xpAmount = xpBase * currentLevel;
            const itemAmount = itemBase * currentLevel;

            // Check for Level Up
            const newXp = Number(selectedProfile?.miningXp || 0n);
            const newLevel = calculateProgress(BigInt(newXp)).level;
            
            const oldXp = newXp - xpAmount;
            const oldLevel = calculateProgress(BigInt(oldXp)).level;
            
            if (newLevel > oldLevel) {
                showToast(`Level Up! Mining ${newLevel}`, 'level-up');
            }

            showToast(`+${xpAmount} Mining XP`, 'mining-xp');
            showToast(`+${itemAmount} Iron Ore`, 'item-ore');
        } else {
             showToast('Action Complete!', 'inventory');
        }
    }

    async function handleAction(action: 'chop' | 'mine' | 'claim' | 'claimStarterPickaxe', tokenId: bigint) {
    if (!account || actionLoading || !selectedProfile) return;
    actionLoading = action;
    errorMsg = null;

    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        if (!walletClient || !publicClient) throw new Error("Wallet not connected");

        let address: Address;
        let abi: any;
        let functionName: string;
        let args = [tokenId];

        if (selectedProfile.version === 'v1') {
            if (action === 'chop') {
                address = CONTRACT_ADDRESSES.SkillerChopping as Address;
                abi = ABIS.SkillerChopping;
                functionName = 'chopTree';
            } else if (action === 'mine') {
                address = CONTRACT_ADDRESSES.SkillerMining as Address;
                abi = ABIS.SkillerMining;
                functionName = 'mineOre';
            } else {
                address = CONTRACT_ADDRESSES.SkillerMining as Address;
                abi = ABIS.SkillerMining;
                functionName = 'claimPickaxe';
            }
        } else {
            // V2 Logic (Diamond)
            address = CONTRACT_ADDRESSES.Diamond as Address;
            abi = ABIS.GameDiamond;
            
            // Convert version to BigInt
            const versionInt = BigInt(APP_VERSION.split('.').join(''));
            
            if (action === 'chop') {
                 functionName = 'chopOak';
                 args = [args[0], versionInt];
            } else if (action === 'mine') {
                functionName = 'mineIron';
                args = [args[0], versionInt];
            } else if (action === 'claimStarterPickaxe') {
                functionName = 'claimStarterPickaxe';
            } else {
                throw new Error("Unknown action");
            }
        }

        const { request } = await publicClient.simulateContract({
            account,
            address,
            abi,
            functionName,
            args
        });

        const hash = await walletClient.writeContract(request);
        showToast('Transaction Sent...');
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        await new Promise(r => setTimeout(r, 2000));
        await loadProfiles(true);
        
        // Better Toast
        // const toastData = getActionToast(action, receipt.logs, selectedProfile.version);
        // showToast(toastData.msg, toastData.type);
        
        // Split toasts logic
        getActionToast(action, receipt.logs, selectedProfile.version);

    } catch (e: any) {
        console.error(`Error ${action}:`, e);
        if (e.message?.includes("User rejected") || e.message?.includes("User denied")) {
            showToast("Transaction Cancelled", 'error');
        } else {
            showToast(`Failed to ${action}`, 'error');
        }
    } finally {
        actionLoading = null;
    }
  }

  async function deleteItem() {
      if (!selectedItem || !account || !selectedProfile) return;
      
      // Confirmation handled by UI state

      actionLoading = 'delete';
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        const address = selectedProfile.version === 'v1' ? CONTRACT_ADDRESSES.SkillerItems : CONTRACT_ADDRESSES.SkillerItemsV2;
        const abi = selectedProfile.version === 'v1' ? ABIS.SkillerItems : ABIS.SkillerItemsV2;
        const deadAddress = '0x000000000000000000000000000000000000dEaD';
        
        const tbaAddress = selectedProfile.tba;
        const itemsAddr = address;
        
        // Verify Code exists at TBA
        const code = await publicClient.getBytecode({ address: tbaAddress });
        if (!code || code === '0x') {
            showToast("Activating Account...", 'default');
            try {
                const chainId = await publicClient.getChainId();
                const profileAddress = selectedProfile.version === 'v1' 
                    ? CONTRACT_ADDRESSES.SkillerProfile 
                    : CONTRACT_ADDRESSES.SkillerProfileV2;

                const { request: deployReq } = await publicClient.simulateContract({
                    account,
                    address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
                    abi: ABIS.ERC6551Registry,
                    functionName: 'createAccount',
                    args: [
                        CONTRACT_ADDRESSES.ERC6551Account as Address,
                        0n, // salt
                        BigInt(chainId),
                        profileAddress as Address,
                        selectedProfile.id
                    ]
                });
                const deployHash = await walletClient.writeContract(deployReq);
                await publicClient.waitForTransactionReceipt({ hash: deployHash });
                
                // Wait a moment for the node to index the code
                await new Promise(r => setTimeout(r, 2000));
                showToast("Account Activated!");
            } catch (deployError: any) {
                console.error("Activation failed:", deployError);
                throw new Error("Failed to activate account: " + deployError.message);
            }
        }
        
        // Re-check Balance on Chain
        const currentBalance = await publicClient.readContract({
            address: itemsAddr as Address,
            abi,
            functionName: 'balanceOf',
            args: [tbaAddress, selectedItem.id]
        }) as bigint;

        if (currentBalance === 0n) {
             showToast("Item already deleted or not found.", 'inventory');
             selectedItem = null;
             await loadProfiles(true);
             return;
        }

        const amountToBurn = currentBalance; // Burn everything found

        // Encode the ERC1155 safeTransferFrom call
        const transferData = encodeFunctionData({
            abi: abi,
            functionName: 'safeTransferFrom',
            args: [tbaAddress, deadAddress, selectedItem.id, amountToBurn, '0x']
        });
        
        // Check TBA native balance for gas
        const tbaBalance = await publicClient.getBalance({ address: tbaAddress });
        
        if (tbaBalance === 0n) {
             showFundConfirmation = true;
             actionLoading = null; 
             return;
        }

        // Execute from TBA
        try {
             const { request } = await publicClient.simulateContract({
                account,
                address: tbaAddress,
                abi: ABIS.ERC6551Account,
                functionName: 'execute',
                args: [itemsAddr, 0n, transferData, 0n] // 0 = call
            });
            
            const hash = await walletClient.writeContract(request);
            showToast(`Deleting all ${selectedItem.name}...`);
            await publicClient.waitForTransactionReceipt({ hash });
            
            showToast('Item Deleted', 'inventory');
            selectedItem = null; 
            await loadProfiles(true);

        } catch (execError: any) {
             console.error("Execution failed details:", execError);
             if (execError.message?.includes("Cannot read properties of null")) {
                 throw new Error("RPC Error: Failed to simulate execution. Try again or check console.");
             }
             throw new Error(`Execution failed: ${execError.shortMessage || execError.message}`);
        }
        
      } catch (e: any) {
          console.error("Delete failed:", e);
          showToast(`Failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function handleQuest(questId: number) {
      if (!selectedProfile || !account || !!actionLoading) return;
      
      // Quest Config
      const questMap = {
          1: { id: 201n, amount: 50n, name: 'Oak Logs' },
          2: { id: 301n, amount: 50n, name: 'Iron Ore' },
          3: { id: 1n, amount: 1000n * 10n**18n, name: 'Gold Coins' }
      };
      const quest = questMap[questId as keyof typeof questMap];
      if (!quest) return;

      actionLoading = `quest-${questId}`;
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);

        const tbaAddress = selectedProfile.tba;
        
        // Verify Code exists at TBA (Activate if needed)
        const code = await publicClient.getBytecode({ address: tbaAddress });
        if (!code || code === '0x') {
            showToast("Activating Account...", 'default');
            try {
                const chainId = await publicClient.getChainId();
                const profileAddress = selectedProfile.version === 'v1' 
                    ? CONTRACT_ADDRESSES.SkillerProfile 
                    : CONTRACT_ADDRESSES.SkillerProfileV2;

                const { request: deployReq } = await publicClient.simulateContract({
                    account,
                    address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
                    abi: ABIS.ERC6551Registry,
                    functionName: 'createAccount',
                    args: [
                        CONTRACT_ADDRESSES.ERC6551Account as Address,
                        0n, // salt
                        BigInt(chainId),
                        profileAddress as Address,
                        selectedProfile.id
                    ]
                });
                const deployHash = await walletClient.writeContract(deployReq);
                await publicClient.waitForTransactionReceipt({ hash: deployHash });
                
                // Wait a moment for the node to index the code
                await new Promise(r => setTimeout(r, 2000));
                showToast("Account Activated!");
            } catch (deployError: any) {
                console.error("Activation failed:", deployError);
                throw new Error("Failed to activate account: " + deployError.message);
            }
        }

        // Check Balance
        const itemsAddr = selectedProfile.version === 'v1' ? CONTRACT_ADDRESSES.SkillerItems : CONTRACT_ADDRESSES.SkillerItemsV2;
        const abi = selectedProfile.version === 'v1' ? ABIS.SkillerItems : ABIS.SkillerItemsV2;
        
        const balance = await publicClient.readContract({
            address: itemsAddr as Address,
            abi,
            functionName: 'balanceOf',
            args: [tbaAddress, quest.id]
        }) as bigint;

        if (balance < quest.amount) {
            throw new Error(`Need ${quest.amount} ${quest.name}`);
        }

        // Check TBA Gas (Buffer of 0.0001 ETH)
        const tbaBalance = await publicClient.getBalance({ address: tbaAddress });
        if (tbaBalance < 100000000000000n) {
             showFundConfirmation = true;
             showQuests = false; // Hide quest modal
             actionLoading = null;
             return;
        }

        // Encode Quest ID (uint256) manually to avoid import issues
        // Quest ID is simple number, pad to 32 bytes (64 chars)
        const questIdHex = BigInt(questId).toString(16).padStart(64, '0');
        const data = `0x${questIdHex}`;

        // Encode Transfer: safeTransferFrom(from, to, id, amount, data)
        // Use manual ABI because the generated one might be incorrect (ERC721 vs ERC1155 mismatch)
        const safeTransferFromAbi = [{
            "inputs": [
                { "name": "from", "type": "address" },
                { "name": "to", "type": "address" },
                { "name": "id", "type": "uint256" },
                { "name": "amount", "type": "uint256" },
                { "name": "data", "type": "bytes" }
            ],
            "name": "safeTransferFrom",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }];

        const transferData = encodeFunctionData({
            abi: safeTransferFromAbi,
            functionName: 'safeTransferFrom',
            args: [
                tbaAddress, 
                CONTRACT_ADDRESSES.Diamond as Address, // Send to Diamond
                quest.id, 
                quest.amount, 
                data
            ]
        });

        // Execute from TBA
        const { request } = await publicClient.simulateContract({
            account,
            address: tbaAddress,
            abi: ABIS.ERC6551Account,
            functionName: 'execute',
            args: [itemsAddr, 0n, transferData, 0n]
        });

        const initialGold = selectedProfile.goldBalance || 0n;
        const hash = await walletClient.writeContract(request);
        showToast(`Contributing ${quest.name}...`);
        await publicClient.waitForTransactionReceipt({ hash });
        
        // Reload profiles first so the balance updates visually when the spinner stops
        await loadProfiles(true);
        
        // Calculate expected reward
        const goldCharms = selectedProfile.goldCharm || 0n;
        const charmMultiplier = 1n + goldCharms;
        const baseReward = 100n;
        const totalReward = baseReward * charmMultiplier;

        if (questId === 3) {
             // Calculate reward based on balance change
             // Or trust the charm multiplier logic we know exists
             // The random reward is hard to predict without parsing logs, but we can show ranges or wait for balance diff.
             // Let's trust the balance diff approach for King's Tribute which has RNG.
             
             const updatedProfile = profiles.find(p => p.id === selectedProfile!.id);
             const finalGold = updatedProfile?.goldBalance || initialGold;
             const cost = 1000n * 10n**18n;
             
             // Reward = Final - (Initial - Cost)
             const rewardWei = finalGold - (initialGold - cost); // final = initial - cost + reward => reward = final - initial + cost
             const rewardFormatted = Math.floor(Number(rewardWei) / 1e18);

             showToast('Quest Completed!', 'inventory');
             if (rewardFormatted > 0) {
                showToast(`+${rewardFormatted.toLocaleString()} Gold Coins`, 'item-received');
             } else {
                showToast('The King was not pleased.', 'error');
             }
        } else {
             showToast('Quest Completed!', 'inventory');
             showToast(`+${totalReward.toLocaleString()} Gold Coins`, 'item-received');
        }

      } catch (e: any) {
          console.error("Quest failed:", e);
          showToast(`Quest failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function handleBuy(item: 'mining-charm' | 'woodcutting-charm' | 'gold-charm') {
      if (!account || actionLoading || !selectedProfile) return;
      actionLoading = 'buy';
      
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        const address = CONTRACT_ADDRESSES.Diamond as Address;
        
        const itemId = item === 'mining-charm' ? 401n : (item === 'woodcutting-charm' ? 402n : 403n);

        const { request } = await publicClient.simulateContract({
            account,
            address,
            abi: [...ABIS.GameDiamond, {
                "inputs": [
                    { "internalType": "uint256", "name": "itemId", "type": "uint256" },
                    { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
                ],
                "name": "buyItem",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }],
            functionName: 'buyItem',
            args: [itemId, selectedProfile.id]
        });
        
        const hash = await walletClient.writeContract(request);
        showToast('Buying...');
        await publicClient.waitForTransactionReceipt({ hash });
        
        // Wait a moment for indexing/state update
        await new Promise(r => setTimeout(r, 2000));
        await loadProfiles(true);
        
        showToast('Purchase Complete!', 'inventory');
        
        if (item === 'gold-charm') {
            showToast('+1 Gold Charm', 'item-gold');
        } else {
            showToast(item === 'mining-charm' ? '+1 Rock Charm' : '+1 Tree Charm', item === 'mining-charm' ? 'item-mine-charm' : 'item-wood-charm');
        }
        
        // showShop = false; // Keep shop open for multi-buy
      } catch (e: any) {
          console.error("Buy failed:", e);
          showToast(`Buy failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function handleCraft(item: 'iron-axe' | 'iron-pickaxe') {
      if (!account || actionLoading || !selectedProfile) return;
      actionLoading = 'craft';
      
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        const address = CONTRACT_ADDRESSES.Diamond as Address;
        const abi = ABIS.GameDiamond;
        const functionName = item === 'iron-axe' ? 'craftIronAxe' : 'craftIronPickaxe';
        
        const { request } = await publicClient.simulateContract({
            account,
            address,
            abi,
            functionName,
            args: [selectedProfile.id]
        });
        
        const hash = await walletClient.writeContract(request);
        showToast('Crafting...');
        await publicClient.waitForTransactionReceipt({ hash });
        
        await loadProfiles(true);
        showToast('Crafting Complete!', 'inventory');
        
        if (item === 'iron-axe') {
            showToast('+1 Iron Axe', 'item-received');
        } else if (item === 'iron-pickaxe') {
            showToast('+1 Iron Pickaxe', 'item-received');
        }

        showCrafting = false;
      } catch (e: any) {
          console.error("Crafting failed:", e);
          showToast(`Crafting failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function createProfile() {
    if (!account) return;
    loading = true;
    errorMsg = null;
    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        const address = CONTRACT_ADDRESSES.Diamond as Address;
        const abi = ABIS.GameDiamond; 
        
        const { request } = await publicClient.simulateContract({
            account,
            address,
            abi,
            functionName: 'createCharacter',
            args: []
        });
        const hash = await walletClient.writeContract(request);
        showToast('Minting Character...');
        await publicClient.waitForTransactionReceipt({ hash });
        
        await new Promise(r => setTimeout(r, 2000));
        await loadProfiles(true);
        showToast('Character Created!');
    } catch (e: any) {
        console.error("Error creating profile:", e);
        showToast("Failed to create profile", 'error');
    } finally {
        loading = false;
    }
  }
  
  async function getTbaForProfile(tokenId: bigint, publicClient: any, version: 'v1' | 'v2'): Promise<Address> {
      const chainIdFromNetwork = await publicClient.getChainId();
      const profileAddress = version === 'v1' ? CONTRACT_ADDRESSES.SkillerProfile : CONTRACT_ADDRESSES.SkillerProfileV2;
      
      return await publicClient.readContract({
        address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
        abi: ABIS.ERC6551Registry,
        functionName: 'account',
        args: [
            CONTRACT_ADDRESSES.ERC6551Account as Address,
            0n,
            BigInt(chainIdFromNetwork),
            profileAddress as Address,
            tokenId
        ]
      });
  }

  async function handleSend() {
      if (!selectedItem || !account || !selectedProfile || !sendRecipientId || !sendAmount) return;
      
      actionLoading = 'send';
      try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        // Resolve Recipient
        const recipientId = BigInt(sendRecipientId);
        if (recipientId === selectedProfile.id) {
            throw new Error("Cannot send to self");
        }

        // Determine recipient TBA
        // We assume same version for simplicity, or we could check if recipient exists in V2 first?
        // The user says "send to OTHER skillers by their #". 
        // If I am V2, I probably send to V2 Skiller #. 
        // Let's assume same version for now.
        const recipientTba = await getTbaForProfile(recipientId, publicClient, selectedProfile.version);

        const address = selectedProfile.version === 'v1' ? CONTRACT_ADDRESSES.SkillerItems : CONTRACT_ADDRESSES.SkillerItemsV2;
        const abi = selectedProfile.version === 'v1' ? ABIS.SkillerItems : ABIS.SkillerItemsV2;
        
        const tbaAddress = selectedProfile.tba;
        const itemsAddr = address;

        // Verify Code exists at TBA (Activate if needed)
        const code = await publicClient.getBytecode({ address: tbaAddress });
        if (!code || code === '0x') {
            showToast("Activating Account...", 'default');
            try {
                const chainId = await publicClient.getChainId();
                const profileAddress = selectedProfile.version === 'v1' 
                    ? CONTRACT_ADDRESSES.SkillerProfile 
                    : CONTRACT_ADDRESSES.SkillerProfileV2;

                const { request: deployReq } = await publicClient.simulateContract({
                    account,
                    address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
                    abi: ABIS.ERC6551Registry,
                    functionName: 'createAccount',
                    args: [
                        CONTRACT_ADDRESSES.ERC6551Account as Address,
                        0n, // salt
                        BigInt(chainId),
                        profileAddress as Address,
                        selectedProfile.id
                    ]
                });
                const deployHash = await walletClient.writeContract(deployReq);
                await publicClient.waitForTransactionReceipt({ hash: deployHash });
                
                // Wait a moment for the node to index the code
                await new Promise(r => setTimeout(r, 2000));
                showToast("Account Activated!");
            } catch (deployError: any) {
                console.error("Activation failed:", deployError);
                throw new Error("Failed to activate account: " + deployError.message);
            }
        }

        // Check Balance
        const amount = BigInt(sendAmount) * (selectedItem.name.includes('Gold') && selectedProfile.version === 'v2' ? 1000000000000000000n : 1n);
        
        const currentBalance = await publicClient.readContract({
            address: itemsAddr as Address,
            abi,
            functionName: 'balanceOf',
            args: [tbaAddress, selectedItem.id]
        }) as bigint;

        if (currentBalance < amount) {
             throw new Error("Insufficient balance");
        }

        // Check TBA gas
        const tbaBalance = await publicClient.getBalance({ address: tbaAddress });
        if (tbaBalance === 0n) {
             showFundConfirmation = true;
             actionLoading = null;
             // Keep send modal open
             return;
        }

        // Encode Transfer
        const transferData = encodeFunctionData({
            abi: abi,
            functionName: 'safeTransferFrom',
            args: [tbaAddress, recipientTba, selectedItem.id, amount, '0x']
        });

        // Execute
        const { request } = await publicClient.simulateContract({
            account,
            address: tbaAddress,
            abi: ABIS.ERC6551Account,
            functionName: 'execute',
            args: [itemsAddr, 0n, transferData, 0n]
        });
        
        const hash = await walletClient.writeContract(request);
        showToast(`Sending ${sendAmount} ${selectedItem.name}...`);
        await publicClient.waitForTransactionReceipt({ hash });
        
        showToast('Item Sent!', 'inventory');
        showSendModal = false;
        sendRecipientId = '';
        sendAmount = '1';
        
        // Capture item name before potentially nulling selectedItem
        const sentItemName = selectedItem ? selectedItem.name : '';

        // If all items sent, close the detail view
        if (amount === currentBalance) {
             // Also remove from selectedProfile so it disappears from inventory immediately
             if (selectedProfile && sentItemName) {
                 if (sentItemName.includes('Gold')) selectedProfile.goldBalance = 0n;
                 else if (sentItemName.includes('Oak Logs')) selectedProfile.woodBalance = 0n;
                 else if (sentItemName.includes('Copper Ore')) selectedProfile.oreBalance = 0n;
                 else if (sentItemName.includes('Iron Ore')) selectedProfile.ironOreBalance = 0n;
                 else if (sentItemName.includes('Bronze Axe')) selectedProfile.axeBalance = 0n;
                 else if (sentItemName.includes('Iron Axe')) selectedProfile.ironAxeBalance = 0n;
                 else if (sentItemName.includes('Bronze Pickaxe')) selectedProfile.pickaxeBalance = 0n;
                 else if (sentItemName.includes('Iron Pickaxe')) selectedProfile.ironPickaxeBalance = 0n;
                 else if (sentItemName.includes('Tree Charm')) selectedProfile.woodcuttingCharm = 0n;
                 else if (sentItemName.includes('Rock Charm')) selectedProfile.miningCharm = 0n;
                 else if (sentItemName.includes('Gold Charm')) selectedProfile.goldCharm = 0n;
             }
             selectedItem = null;
        } else {
            // Update local balance display before reload finishes
            if (selectedItem) {
                selectedItem.balance = currentBalance - amount;
            }
            if (selectedProfile) {
                 // We can't easily update the profile balances for partial sends without mapping IDs perfectly
                 // But for full sends (most common for charms/tools), the above block handles it.
                 // For stackable items, we'll rely on loadProfiles(true) which is called below.
            }
        }

        await loadProfiles(true);

      } catch (e: any) {
          console.error("Send failed:", e);
          showToast(`Failed: ${e.message}`, 'error');
      } finally {
          actionLoading = null;
      }
  }

  async function fundCharacter() {
        if (!selectedProfile || !account) return;
        isFunding = true;
        try {
            const walletClient = await getWalletClient(config);
            const publicClient = getPublicClient(config);
            
            showToast("Funding Character...", 'default');
            const tx = await walletClient.sendTransaction({
                to: selectedProfile.tba,
                value: BigInt(500000000000000) // 0.0005 ETH
            });
            await publicClient.waitForTransactionReceipt({ hash: tx });
            showToast("Character Funded!");
            showFundConfirmation = false;
            // Refresh profile to update balance
            await loadProfiles(true);
        } catch (fundError: any) {
            console.error("Funding failed:", fundError);
            showToast("Funding failed", 'error');
        } finally {
            isFunding = false;
        }
  }

  async function drainTba() {
      if (!selectedProfile || !account || !selectedProfile.tbaBalance || selectedProfile.tbaBalance === 0n) return;
      
      isDraining = true;
      try {
          const walletClient = await getWalletClient(config);
          const publicClient = getPublicClient(config);

          const tbaAddress = selectedProfile.tba;
          const balance = selectedProfile.tbaBalance;
          
          // We need to leave some gas for the execution itself?
          // The caller pays for the gas of the `execute` function.
          // The TBA simply forwards the call.
          // So we should be able to send the full balance.
          
          const { request } = await publicClient.simulateContract({
            account,
            address: tbaAddress,
            abi: ABIS.ERC6551Account,
            functionName: 'execute',
            args: [account, balance, '0x', 0n] // Send to owner (account), amount=balance, data=0x, op=0
          });

          const hash = await walletClient.writeContract(request);
          showToast("Draining TBA...");
          await publicClient.waitForTransactionReceipt({ hash });
          
          showToast("TBA Drained!");
          await loadProfiles(true);
          
      } catch (e: any) {
          console.error("Drain failed:", e);
          showToast(`Drain failed: ${e.message}`, 'error');
      } finally {
          isDraining = false;
      }
  }

  async function burnCharacter() {
        if (!selectedProfile || !account || burnConfirmationInput !== 'BURN') return;
        isBurning = true;
        try {
            const walletClient = await getWalletClient(config);
            const publicClient = getPublicClient(config);
            const address = selectedProfile.version === 'v1' ? CONTRACT_ADDRESSES.SkillerProfile : CONTRACT_ADDRESSES.SkillerProfileV2;
            const abi = selectedProfile.version === 'v1' ? ABIS.SkillerProfile : ABIS.SkillerProfileV2;

            // Use transferFrom to burn (send to dead address) if burn() is not supported
            const deadAddress = '0x000000000000000000000000000000000000dEaD';
            
            const { request } = await publicClient.simulateContract({
                account,
                address: address as Address,
                abi,
                functionName: 'transferFrom', 
                args: [account, deadAddress, selectedProfile.id]
            });
            const hash = await walletClient.writeContract(request);
            showToast('Burning Character...');
            await publicClient.waitForTransactionReceipt({ hash });
            
            showToast('Character Burned');
            showProfile = false;
            selectedProfileId = null;
            await loadProfiles(true);
        } catch(e: any) {
             console.error("Burn failed:", e);
             showToast("Failed to burn", 'error');
        } finally {
            isBurning = false;
            showBurnConfirmation = false;
        }
  }
</script>

<div class="app-container">
    <header>
        <div class="header-left">
            {#if selectedProfile}
                <button class="square-btn" on:click={() => { selectedProfileId = null; closeAllModals(); }}>
                    <ArrowLeft size={24} />
                </button>
            {:else}
                <div class="app-icon">
                    <img src="/skiller-icon-full.jpeg" alt="App Icon" />
                </div>
            {/if}
        </div>
        <div class="header-center">
            <div class="title-card">
                {#if selectedProfile}
                    SKILLER #{selectedProfile.id} 
                    {#if selectedProfile.version === 'v1'}
                        <span class="version-tag">V1</span>
                    {/if}
                {:else}
                    SKILLER
                {/if}
            </div>
        </div>
        <div class="header-right">
            {#if selectedProfile}
                <button class="square-btn" on:click={() => toggleModal('profile')}>
                    <User size={24} />
                </button>
            {:else if account}
                 <button class="square-btn" on:click={() => toggleModal('profile')}>
                    <User size={24} />
                </button>
            {/if}
        </div>
    </header>

    <!-- Profile Modal -->
    {#if showProfile}
        <div class="modal-backdrop" on:click={() => showProfile = false}>
            <div class="modal-content profile-modal" on:click|stopPropagation>
                <button 
                    class="refresh-profile-btn" 
                    on:click={refreshCurrentProfile}
                    disabled={!!actionLoading}
                    title="Refresh Balances"
                >
                    {#if actionLoading === 'refresh-profile'}
                        <div class="spinner-mini"></div>
                    {:else}
                        <RefreshCw size={16} />
                    {/if}
                </button>
                <div class="profile-info">
                    {#if selectedProfile}
                        <h3>SKILLER #{selectedProfile.id}</h3>
                        <div class="info-row">
                            <span class="label">Address</span>
                            <span class="value" on:click={() => copyToClipboard(account || '')}>
                                {truncateAddress(account || '')} <Copy size={12}/>
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="label">Address ETH</span>
                            <span class="value">
                                {(Number(accountBalance) / 1e18).toFixed(4)} ETH
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="label">TBA</span>
                            <span class="value" on:click={() => copyToClipboard(selectedProfile?.tba || '')}>
                                {truncateAddress(selectedProfile?.tba || '')} <Copy size={12}/>
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="label">TBA ETH</span>
                            <span class="value">
                                {Number(selectedProfile?.tbaBalance || 0n) / 1e18} ETH
                            </span>
                        </div>

                        <button class="fund-btn" on:click={() => { showFundConfirmation = true; showProfile = false; }}>
                            Fund TBA
                        </button>

                        {#if (selectedProfile.tbaBalance || 0n) > 0n}
                            <button class="fund-btn" on:click={drainTba} disabled={isDraining}>
                                {#if isDraining}<div class="spinner-small"></div>{:else}Drain TBA{/if}
                            </button>
                        {/if}
                        
                        {#if selectedProfile.version === 'v1'}
                            <div class="migration-box">
                                <p>Upgrade to V2 available!</p>
                                <button class="migrate-btn" on:click={() => handleMigrate(selectedProfile.id)} disabled={!!actionLoading}>
                                    {#if actionLoading === 'migrate'}
                                        <div class="spinner-small"></div>
                                    {:else}
                                        <RefreshCw size={16} /> Migrate to V2
                                    {/if}
                                </button>
                            </div>
                        {/if}

                        <div class="burn-section">
                            <button class="burn-trigger-btn" on:click={() => { showBurnConfirmation = true; showProfile = false; }}>
                                <Trash2 size={16} /> Burn Character
                            </button>
                        </div>
                    {:else}
                         <h3>Player Profile</h3>
                         <div class="info-row">
                            <span class="label">Address</span>
                            <span class="value" on:click={() => copyToClipboard(account || '')}>
                                {truncateAddress(account || '')} <Copy size={12}/>
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="label">Address ETH</span>
                            <span class="value">
                                {(Number(accountBalance) / 1e18).toFixed(4)} ETH
                            </span>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
    
    <!-- Burn Confirmation Modal -->
    {#if showBurnConfirmation}
        <div class="modal-backdrop">
            <div class="modal-content burn-modal">
                <h3 class="text-danger">Danger Zone</h3>
                <p class="burn-warning">Type <strong>BURN</strong> to delete SKILLER #{selectedProfile?.id}. This cannot be undone.</p>
                <div class="input-group">
                    <input 
                        type="text" 
                        class="confirm-input"
                        bind:value={burnConfirmationInput}
                        placeholder="Type BURN"
                    />
                </div>
                <div class="modal-actions">
                    <button class="cancel-btn" on:click={() => showBurnConfirmation = false}>Cancel</button>
                    <button 
                        class="confirm-burn-btn" 
                        disabled={burnConfirmationInput !== 'BURN' || isBurning}
                        on:click={burnCharacter}
                    >
                        {#if isBurning}<div class="spinner-small"></div>{:else}Burn{/if}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Fund Confirmation Modal -->
    {#if showFundConfirmation}
        <div class="fund-modal-backdrop">
            <div class="fund-modal-content">
                <h3>Fund Character</h3>
                <p style="font-size: 0.9rem; color: #aaa; margin-bottom: 1rem;">
                    Your character (TBA) needs a small amount of ETH (0.0005) to pay for gas to send or delete items.
                </p>
                <div class="modal-actions">
                    <button class="cancel-btn" on:click={() => showFundConfirmation = false}>Cancel</button>
                    <button 
                        class="confirm-burn-btn confirm-btn-fixed" 
                        style="background: #2563eb; color: white;"
                        disabled={isFunding}
                        on:click={fundCharacter}
                    >
                        {#if isFunding}<div class="spinner-small"></div>{:else}Send{/if}
                    </button>
                </div>
            </div>
        </div>
    {/if}
    
    <!-- Inventory Modal -->
    {#if showInventory}
        <div class="modal-backdrop" on:click={() => { showInventory = false; selectedItem = null; }}>
            <div class="modal-content inventory-modal" on:click|stopPropagation>
                 <!-- Item Detail View -->
                 {#if selectedItem}
                    <div class="item-detail">
                        <div class="detail-header" style="justify-content: space-between;">
                            <button class="back-btn" on:click={() => selectedItem = null}><ArrowLeft size={20}/></button>
                            <h3>{selectedItem.name}</h3>
                            <button class="back-btn delete-icon-btn" on:click={deleteItem} disabled={!!actionLoading}>
                                {#if actionLoading === 'delete'}
                                    <div class="spinner-small"></div>
                                {:else}
                                    <Trash2 size={20} color="#cf6679"/>
                                {/if}
                            </button>
                        </div>
                        <div class="detail-content" style="gap: 1rem;">
                            <div class="large-icon">
                                {#if selectedItem.name.includes('Gold')} <Coins size={48} color="#fbbf24"/>
                                {:else if selectedItem.name.includes('Log')} <TreeDeciduous size={48} color="#4ade80"/>
                                {:else if selectedItem.name.includes('Iron Ore')} <Mountain size={48} color="#b0bec5"/>
                                {:else if selectedItem.name.includes('Ore')} <Mountain size={48} color="#b0bec5"/>
                                {:else if selectedItem.name.includes('Iron Axe')} <Axe size={48} color="#b0bec5"/>
                                {:else if selectedItem.name.includes('Axe')} <Axe size={48} color="#cd7f32"/>
                                {:else if selectedItem.name.includes('Iron Pickaxe')} <Pickaxe size={48} color="#b0bec5"/>
                                {:else if selectedItem.name.includes('Pickaxe')} <Pickaxe size={48} color="#cd7f32"/>
                                {:else if selectedItem.name.includes('Tree Charm')} 
                                    <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                                        <Gem size={48} color="#4ade80"/>
                                    </div>
                                {:else if selectedItem.name.includes('Rock Charm')} 
                                    <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                                        <Gem size={48} color="#b0bec5"/>
                                    </div>
                                {/if}
                            </div>
                            <p>Balance: {selectedItem.name.includes('Gold') && selectedProfile?.version === 'v2' 
                                ? Math.floor(Number(selectedItem.balance) / 1e18)
                                : selectedItem.balance}</p>
                            
                            <div class="detail-actions">
                                <button class="send-btn" on:click={() => { showSendModal = true; sendAmount = '1'; }}>
                                    <Send size={16}/> Send
                                </button>
                            </div>
                        </div>
                    </div>
                 {:else if selectedProfile}
                    <div class="inventory-grid">
                        <!-- Gold -->
                        <div class="inventory-item" title="Gold Coins" on:click={() => selectedItem = { id: 1n, name: 'Gold Coins', balance: selectedProfile?.goldBalance || 0n }}>
                            <div class="item-icon"><Coins size={24} color="#fbbf24"/></div>
                            <div class="item-count">{formatInventoryNumber(Math.floor(Number(selectedProfile.goldBalance || 0n) / (selectedProfile.version === 'v2' ? 1e18 : 1)))}</div>
                        </div>
                        <!-- Wood -->
                        {#if (selectedProfile.woodBalance || 0n) > 0n}
                            <div class="inventory-item" title="Logs" on:click={() => selectedItem = { id: 201n, name: 'Oak Logs', balance: selectedProfile?.woodBalance || 0n }}>
                                <div class="item-icon"><TreeDeciduous size={24} color="#4ade80"/></div> 
                                <div class="item-count">{formatInventoryNumber(selectedProfile.woodBalance)}</div>
                            </div>
                        {/if}
                        <!-- Ore -->
                        {#if (selectedProfile.oreBalance || 0n) > 0n && (selectedProfile.version === 'v1' || selectedProfile.oreBalance !== selectedProfile.ironOreBalance)}
                            <div class="inventory-item" title="Copper Ore" on:click={() => selectedItem = { id: 301n, name: 'Copper Ore', balance: selectedProfile?.oreBalance || 0n }}>
                                <div class="item-icon"><Mountain size={24} color="#b0bec5"/></div>
                                <div class="item-count">{formatInventoryNumber(selectedProfile.oreBalance)}</div>
                            </div>
                        {/if}
                         <!-- V2: Iron Ore/Coal -->
                        {#if (selectedProfile.ironOreBalance || 0n) > 0n}
                             <div class="inventory-item" title="Iron Ore" on:click={() => selectedItem = { id: 301n, name: 'Iron Ore', balance: selectedProfile?.ironOreBalance || 0n }}>
                                <div class="item-icon"><Mountain size={24} color="#b0bec5"/></div>
                                <div class="item-count">{formatInventoryNumber(selectedProfile.ironOreBalance)}</div>
                            </div>
                        {/if}
                        
                        <!-- Tools -->
                        {#if (selectedProfile.axeBalance || 0n) > 0n}
                            <div class="inventory-item" title="Bronze Axe" on:click={() => selectedItem = { id: 101n, name: 'Bronze Axe', balance: selectedProfile?.axeBalance || 0n }}>
                                <div class="item-icon"><Axe size={24} color="#cd7f32"/></div>
                                <div class="item-count">{selectedProfile.axeBalance}</div>
                            </div>
                        {/if}
                         {#if (selectedProfile.ironAxeBalance || 0n) > 0n}
                            <div class="inventory-item" title="Iron Axe" on:click={() => selectedItem = { id: 102n, name: 'Iron Axe', balance: selectedProfile?.ironAxeBalance || 0n }}>
                                <div class="item-icon"><Axe size={24} color="#b0bec5"/></div>
                                <div class="item-count">{selectedProfile.ironAxeBalance}</div>
                            </div>
                        {/if}
                        
                        {#if (selectedProfile.pickaxeBalance || 0n) > 0n}
                             <div class="inventory-item" title="Bronze Pickaxe" on:click={() => selectedItem = { id: 151n, name: 'Bronze Pickaxe', balance: selectedProfile?.pickaxeBalance || 0n }}>
                                <div class="item-icon"><Pickaxe size={24} color="#cd7f32"/></div>
                                <div class="item-count">{selectedProfile.pickaxeBalance}</div>
                            </div>
                        {/if}
                        {#if (selectedProfile.ironPickaxeBalance || 0n) > 0n}
                             <div class="inventory-item" title="Iron Pickaxe" on:click={() => selectedItem = { id: 152n, name: 'Iron Pickaxe', balance: selectedProfile?.ironPickaxeBalance || 0n }}>
                                <div class="item-icon"><Pickaxe size={24} color="#b0bec5"/></div>
                                <div class="item-count">{selectedProfile.ironPickaxeBalance}</div>
                            </div>
                        {/if}

                        <!-- Charms -->
                        {#if (selectedProfile.miningCharm || 0n) > 0n}
                             <div class="inventory-item" title="Rock Charm" on:click={() => selectedItem = { id: 401n, name: 'Rock Charm', balance: selectedProfile?.miningCharm || 0n }}>
                                <div class="charm-icon-wrapper rock" style="display:flex; align-items:center; justify-content:center;">
                                     <Gem size={24} color="#b0bec5"/>
                                </div>
                                <div class="item-count">{selectedProfile.miningCharm}</div>
                            </div>
                        {/if}
                        {#if (selectedProfile.woodcuttingCharm || 0n) > 0n}
                             <div class="inventory-item" title="Tree Charm" on:click={() => selectedItem = { id: 402n, name: 'Tree Charm', balance: selectedProfile?.woodcuttingCharm || 0n }}>
                                <div class="charm-icon-wrapper tree" style="display:flex; align-items:center; justify-content:center;">
                                     <Gem size={24} color="#4ade80"/>
                                </div>
                                <div class="item-count">{selectedProfile.woodcuttingCharm}</div>
                            </div>
                        {/if}
                        {#if (selectedProfile.goldCharm || 0n) > 0n}
                             <div class="inventory-item" title="Gold Charm" on:click={() => selectedItem = { id: 403n, name: 'Gold Charm', balance: selectedProfile?.goldCharm || 0n }}>
                                <div class="charm-icon-wrapper gold" style="display:flex; align-items:center; justify-content:center;">
                                     <Gem size={24} color="#ffd700"/>
                                </div>
                                <div class="item-count">{selectedProfile.goldCharm}</div>
                            </div>
                        {/if}
                    </div>
                 {:else}
                    <p class="empty-state">No items.</p>
                 {/if}
            </div>
        </div>
    {/if}
    
    <!-- Send Modal -->
    {#if showSendModal && selectedItem}
        <div class="modal-backdrop" on:click={() => showSendModal = false}>
            <div class="modal-content send-modal" on:click|stopPropagation>
                <h3>Send {selectedItem.name}</h3>
                
                <div class="input-group">
                    <label>Recipient Skiller #</label>
                    <input type="number" bind:value={sendRecipientId} placeholder="e.g. 123" class="confirm-input"/>
                </div>
                
                <div class="input-group">
                    <label>Amount</label>
                    <input type="number" bind:value={sendAmount} class="confirm-input"/>
                    <div class="amount-presets">
                        <button on:click={() => sendAmount = '1'}>1</button>
                        <button on:click={() => sendAmount = '10'}>10</button>
                        <button on:click={() => sendAmount = '100'}>100</button>
                        <button on:click={() => {
                             const bal = selectedItem.name.includes('Gold') && selectedProfile?.version === 'v2'
                                ? Math.floor(Number(selectedItem.balance) / 1e18)
                                : Number(selectedItem.balance);
                             sendAmount = bal.toString();
                        }}>All</button>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="cancel-btn" on:click={() => showSendModal = false}>Cancel</button>
                    <button class="confirm-btn" on:click={handleSend} disabled={!sendRecipientId || !sendAmount || !!actionLoading}>
                        {#if actionLoading === 'send'}
                            <div class="spinner-small"></div>
                        {:else}
                            Send
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Crafting Modal -->
    {#if showCrafting}
        <div class="modal-backdrop" on:click={() => showCrafting = false}>
            <div class="modal-content crafting-modal" on:click|stopPropagation>
                <!-- Removed Title as requested -->
                <div class="recipes-list">
                    <!-- Iron Axe -->
                    <div class="recipe-card">
                        <div class="recipe-icon"><Axe size={24} color="#b0bec5"/></div>
                        <div class="recipe-info">
                            <h4>Iron Axe</h4>
                            <div class="cost">
                                <span>100 Iron Ore</span>
                                <span>100 Oak Logs</span>
                            </div>
                        </div>
                        <button 
                            class="craft-btn" 
                            on:click={() => handleCraft('iron-axe')}
                            disabled={!!actionLoading || (selectedProfile?.woodBalance || 0n) < 100n || (selectedProfile?.oreBalance || 0n) < 100n}
                        >
                            Craft
                        </button>
                    </div>
                    
                     <!-- Iron Pickaxe -->
                    <div class="recipe-card">
                        <div class="recipe-icon"><Pickaxe size={24} color="#b0bec5"/></div>
                        <div class="recipe-info">
                            <h4>Iron Pickaxe</h4>
                            <div class="cost">
                                <span>100 Iron Ore</span>
                                <span>100 Oak Logs</span>
                            </div>
                        </div>
                         <button 
                            class="craft-btn" 
                            on:click={() => handleCraft('iron-pickaxe')}
                            disabled={!!actionLoading || (selectedProfile?.woodBalance || 0n) < 100n || (selectedProfile?.oreBalance || 0n) < 100n}
                        >
                            Craft
                        </button>
                    </div>
                </div>
                
                <!-- Selected Item Details for Crafting/Shop context (if needed) or reusing modal structure -->
                {#if selectedItem}
                    <div class="recipe-card" style="margin-top: 1rem; border-color: #444;">
                        {#if selectedItem.name === 'Gold Charm'}
                            <div class="recipe-icon">
                                <div class="charm-icon-wrapper gold" style="display:flex; align-items:center; justify-content:center;">
                                     <Gem size={24} color="#ffd700"/>
                                </div>
                            </div>
                        {:else}
                            <!-- Fallback or other icon logic could go here if we wanted icons in details -->
                        {/if}
                        <div class="recipe-info">
                            <h4>Item Details</h4>
                            <div class="cost">
                                <span>{selectedItem.name}</span>
                                <span class="cost-text">Balance: {selectedItem.name.includes('Gold Coins') ? (Number(selectedItem.balance) / 1e18).toLocaleString() : Number(selectedItem.balance).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Shop Modal (Cloned from Quest Modal) -->
    {#if showShop}
        <div class="modal-backdrop" on:click={() => showShop = false}>
            <div class="modal-content quests-modal" on:click|stopPropagation>
                
                <div class="quests-list">
                    <!-- Woodcutting Charm (Tree) -->
                    <div class="quest-card">
                         <div class="quest-icon">
                             <div class="charm-icon-wrapper tree" style="display:flex; align-items:center; justify-content:center;">
                                 <Gem size={28} color="#4ade80"/>
                             </div>
                         </div>
                        <div class="quest-info">
                           <h4>Tree Charm</h4>
                           <div class="cost">
                               <span style="color: #888;">Cost: 1,000 Gold Coins</span>
                           </div>
                       </div>
                       
                       <button 
                           class="quest-btn" 
                           on:click={() => handleBuy('woodcutting-charm')}
                           disabled={!!actionLoading || (selectedProfile?.goldBalance || 0n) < 1000n * 10n**18n}
                       >
                            {#if actionLoading === 'buy-wood'}
                                <div class="spinner-small"></div>
                            {:else}
                                Buy
                            {/if}
                        </button>
                    </div>

                    <!-- Mining Charm (Rock) -->
                    <div class="quest-card">
                        <div class="quest-icon">
                             <div class="charm-icon-wrapper rock" style="display:flex; align-items:center; justify-content:center;">
                                 <Gem size={28} color="#b0bec5"/>
                             </div>
                         </div>
                        <div class="quest-info">
                           <h4>Rock Charm</h4>
                            <div class="cost">
                               <span style="color: #888;">Cost: 1,000 Gold Coins</span>
                           </div>
                       </div>
                       
                       <button 
                           class="quest-btn" 
                           on:click={() => handleBuy('mining-charm')}
                           disabled={!!actionLoading || (selectedProfile?.goldBalance || 0n) < 1000n * 10n**18n}
                       >
                            {#if actionLoading === 'buy-mine'}
                                <div class="spinner-small"></div>
                            {:else}
                                Buy
                            {/if}
                        </button>
                    </div>

                    <!-- Gold Charm -->
                    <div class="quest-card">
                        <div class="quest-icon">
                             <div class="charm-icon-wrapper gold" style="display:flex; align-items:center; justify-content:center;">
                                 <Gem size={28} color="#ffd700"/>
                             </div>
                         </div>
                        <div class="quest-info">
                           <h4>Gold Charm</h4>
                            <div class="cost">
                               <span style="color: #888;">Cost: 100K Gold Coins</span>
                           </div>
                       </div>
                       
                       <button 
                           class="quest-btn" 
                           on:click={() => handleBuy('gold-charm')}
                           disabled={!!actionLoading || (selectedProfile?.goldBalance || 0n) < 100000n * 10n**18n}
                       >
                            {#if actionLoading === 'buy-gold'}
                                <div class="spinner-small"></div>
                            {:else}
                                Buy
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
    
    <!-- Quests Modal -->
    {#if showQuests}
        <div class="modal-backdrop" on:click={() => showQuests = false}>
            <div class="modal-content quests-modal" on:click|stopPropagation>
                
                <div class="quests-list">
                    <!-- Quest 1: Oak Logs -->
                    <div class="quest-card">
                        <div class="quest-icon"><TreeDeciduous size={24} color="#4ade80"/></div>
                        <div class="quest-info">
                            <h4>Lumberjack's Aid</h4>
                            <div class="cost">
                                <span>Contribute 50 Oak Logs</span>
                                <span style="color: #ffd700;">Reward: 100 Gold Coins</span>
                            </div>
                        </div>
                        <button 
                            class="quest-btn" 
                            on:click={() => handleQuest(1)}
                            disabled={!!actionLoading || (selectedProfile?.woodBalance || 0n) < 50n}
                        >
                            {#if actionLoading === 'quest-1'}
                                <div class="spinner-small"></div>
                            {:else}
                                Give
                            {/if}
                        </button>
                    </div>

                    <!-- Quest 2: Iron Ore -->
                    <div class="quest-card">
                        <div class="quest-icon"><Mountain size={24} color="#b0bec5"/></div>
                        <div class="quest-info">
                            <h4>Miner's Request</h4>
                            <div class="cost">
                                <span>Contribute 50 Iron Ore</span>
                                <span style="color: #ffd700;">Reward: 100 Gold Coins</span>
                            </div>
                        </div>
                        <button 
                            class="quest-btn" 
                            on:click={() => handleQuest(2)}
                            disabled={!!actionLoading || (selectedProfile?.ironOreBalance || 0n) < 50n}
                        >
                            {#if actionLoading === 'quest-2'}
                                <div class="spinner-small"></div>
                            {:else}
                                Give
                            {/if}
                        </button>
                    </div>

                    <!-- Quest 3: King's Tribute -->
                    <div class="quest-card">
                        <div class="quest-icon"><Coins size={24} color="#ffd700"/></div>
                        <div class="quest-info">
                            <h4>King's Tribute</h4>
                            <div class="cost">
                                <span>Contribute 1,000 Gold</span>
                                <span style="color: #ffd700;">Reward: ???</span>
                            </div>
                        </div>
                        <button 
                            class="quest-btn" 
                            on:click={() => handleQuest(3)}
                            disabled={!!actionLoading || (selectedProfile?.goldBalance || 0n) < 1000n * 10n**18n}
                        >
                            {#if actionLoading === 'quest-3'}
                                <div class="spinner-small"></div>
                            {:else}
                                Give
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
    
    <!-- Skills Modal -->
    {#if showSkills}
        <div class="modal-backdrop" on:click={() => showSkills = false}>
             <div class="modal-content skills-modal" on:click|stopPropagation>
                  <!-- Removed Title as requested -->
                  <div class="skills-list">
                      <!-- Woodcutting -->
                      <div class="skill-box">
                          <div class="skill-icon"><TreeDeciduous size={24} color="#4ade80"/></div>
                          <div class="skill-info">
                              <div class="skill-header">
                                  <span class="skill-label">Woodcutting</span>
                                  <span class="skill-level">Level {selectedProfile?.woodcuttingLevel || 1}</span>
                              </div>
                              <div class="xp-progress">
                                  <div class="xp-bar-mini">
                                       <div class="xp-fill purple" style="width: {(calculateProgress(selectedProfile?.woodcuttingXp || 0n).percent || 0)}%"></div>
                                  </div>
                                  <span class="xp-text-mini">{formatRsNumber(selectedProfile?.woodcuttingXp || 0n)} / {formatRsNumber(calculateProgress(selectedProfile?.woodcuttingXp || 0n).next)} XP</span>
                              </div>
                          </div>
                      </div>
                      
                       <!-- Mining -->
                      <div class="skill-box">
                          <div class="skill-icon"><Mountain size={24} color="#b0bec5"/></div>
                          <div class="skill-info">
                              <div class="skill-header">
                                  <span class="skill-label">Mining</span>
                                  <span class="skill-level">Level {selectedProfile?.miningLevel || 1}</span>
                              </div>
                              <div class="xp-progress">
                                  <div class="xp-bar-mini">
                                       <div class="xp-fill purple" style="width: {(calculateProgress(selectedProfile?.miningXp || 0n).percent || 0)}%"></div>
                                  </div>
                                  <span class="xp-text-mini">{formatRsNumber(selectedProfile?.miningXp || 0n)} / {formatRsNumber(calculateProgress(selectedProfile?.miningXp || 0n).next)} XP</span>
                              </div>
                          </div>
                      </div>
                  </div>
             </div>
        </div>
    {/if}

    <!-- Void / Leaderboard Modal -->
    {#if showLeaderboard}
        <div class="modal-backdrop" on:click={() => showLeaderboard = false}>
            <div class="modal-content void-modal" on:click|stopPropagation>
                <div class="void-header">
                    <div class="void-stats">
                         <div class="stat-box">
                            <span class="label">Void Level</span>
                            <span class="value">{selectedProfile?.voidLevel || 0}</span>
                        </div>
                        <div class="stat-box">
                            <span class="label">Rank</span>
                            <span class="value">#{leaderboardData.findIndex(e => e.tokenId === selectedProfile?.id) !== -1 ? leaderboardData.findIndex(e => e.tokenId === selectedProfile?.id) + 1 : '-'}</span>
                        </div>
                    </div>
                </div>
    
                <div class="void-actions">
                    <div class="recipe-card" style="border-color: #9c27b0;">
                        <div class="recipe-icon"><Trophy size={24} color="#9c27b0"/></div>
                        <div class="recipe-info">
                            <h4>VOID LEVEL {(selectedProfile?.voidLevel || 0n) + 1n}</h4>
                            <div class="cost">
                                <span>{formatRsNumber(voidCost)} Oak Logs</span>
                                <span>{formatRsNumber(voidCost)} Iron Ore</span>
                            </div>
                        </div>
                        <button 
                            class="sacrifice-btn" 
                            on:click={() => handleSacrifice()} 
                            disabled={!!actionLoading || (selectedProfile?.woodBalance || 0n) < voidCost || (selectedProfile?.ironOreBalance || 0n) < voidCost}
                        >
                            {#if actionLoading === 'sacrifice'}
                                <div class="spinner-small"></div>
                            {:else}
                                Sacrifice
                            {/if}
                        </button>
                    </div>
                </div>
    
                <div class="leaderboard-section">
                    <div class="leaderboard-list">
                        {#if leaderboardData.length === 0}
                            <div class="empty-state">No souls have entered the Void yet.</div>
                        {:else}
                            {#each leaderboardData as entry, i}
                                <div class="leaderboard-row {entry.tokenId === selectedProfile?.id ? 'highlight' : ''}">
                                    <span class="rank">#{i+1}</span>
                                    <span class="name">Skiller #{entry.tokenId}</span>
                                    <span class="level">{entry.level}</span>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <main>
        {#if errorMsg}
            <div class="error-banner">{errorMsg}</div>
        {/if}

        <div class="toast-container">
            {#each toasts as toast (toast.id)}
                <div class="toast {toast.type}" animate:flip={{duration: 300}}>
                    {toast.msg}
                </div>
            {/each}
        </div>

        {#if isInitializing}
             <div class="loading">
                <div class="spinner"></div>
                <p>Loading SKILLER...</p>
            </div>
        {:else if !isVersionValid}
             <div class="flex flex-col items-center justify-center min-h-[60vh] bg-stone-900">
                <RefreshCw class="w-16 h-16 text-amber-500 mb-6 animate-spin" />
                <h2 class="text-2xl font-bold text-amber-400 mb-4">Update Required</h2>
                <p class="text-stone-300 mb-8 text-lg">A new version of Skiller is available.</p>
                <button 
                    class="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg"
                    on:click={() => window.location.reload()}
                >
                    Reload Now
                </button>
             </div>
        {:else if !account}
            <div class="welcome">
                <h1>Welcome to SKILLER</h1>
                <p>Connect your wallet to play.</p>
                <button class="mint-btn" on:click={connectWallet}>Connect Wallet</button>
            </div>
        {:else if isLoadingProfiles}
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading characters...</p>
            </div>
        {:else if !selectedProfile}
            <!-- Character Selection Screen -->
            <div class="selection-screen">
                <div class="profiles-list">
                    {#each profiles as profile}
                        <button class="profile-card-btn" on:click={() => selectedProfileId = profile.id}>
                            <div class="profile-btn-content">
                                <span>SKILLER #{profile.id}</span>
                                {#if profile.version === 'v1'}
                                    <span class="version-badge v1">V1</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                </div>
                {#if profiles.length === 0}
                    <div class="empty-state-large">No characters found. Mint one to start!</div>
                {/if}
            </div>
        {:else}
            <!-- Gameplay Screen -->
            <div class="gameplay-screen">
                 {#if selectedProfile.version === 'v1'}
                    <!-- V1 View -->
                    <div class="v1-migration-prompt">
                         <p>V1 Gameplay is disabled.</p>
                         <button class="migrate-btn-large" on:click={() => handleMigrate(selectedProfile.id)} disabled={!!actionLoading}>
                            {#if actionLoading === 'migrate'}
                                <div class="spinner-small"></div>
                            {:else}
                                Migrate to V2
                            {/if}
                         </button>
                    </div>
                 {:else}
                    <!-- V2 Actions -->
                    <div class="actions-container">
                        <button 
                            class="action-btn wood" 
                            disabled={!!actionLoading}
                            on:click={() => handleAction('chop', selectedProfile.id)}
                        >
                            {#if actionLoading === 'chop'}
                                <div class="spinner-small"></div>
                            {:else if (selectedProfile.axeBalance || 0n) === 0n && (selectedProfile.ironAxeBalance || 0n) === 0n}
                                Need Axe
                            {:else}
                                <TreeDeciduous size={20} /> Chop Oak
                            {/if}
                        </button>

                        <button 
                            class="action-btn ore" 
                            disabled={!!actionLoading}
                            on:click={() => {
                                if ((selectedProfile.pickaxeBalance || 0n) === 0n && (selectedProfile.ironPickaxeBalance || 0n) === 0n) {
                                    handleAction('claimStarterPickaxe', selectedProfile.id);
                                } else {
                                    handleAction('mine', selectedProfile.id);
                                }
                            }}
                        >
                            {#if actionLoading === 'mine' || actionLoading === 'claimStarterPickaxe'}
                                <div class="spinner-small"></div>
                            {:else if (selectedProfile.pickaxeBalance || 0n) === 0n && (selectedProfile.ironPickaxeBalance || 0n) === 0n}
                                <Pickaxe size={20} /> Need Pickaxe
                            {:else}
                                <Mountain size={20} /> Mine Iron
                            {/if}
                        </button>
                    </div>
                 {/if}
            </div>
        {/if}
    </main>

    <!-- Footer -->
    <footer>
        {#if !selectedProfile}
            {#if account && !isLoadingProfiles && !isInitializing}
                <button class="mint-btn" on:click={createProfile} disabled={loading}>
                    {#if loading}
                        <div class="spinner-small"></div>
                    {:else}
                        Mint New Character
                    {/if}
                </button>
            {/if}
        {:else}
            <!-- Leaderboard (Leftmost) -->
            {#if selectedProfile.version === 'v2'}
                <button class="square-btn" on:click={() => toggleModal('leaderboard')}>
                    <Trophy size={24} />
                </button>
            {/if}

            <!-- Quests -->
            <button class="square-btn" on:click={() => toggleModal('quests')}>
                <HelpCircle size={24} />
            </button>

            <!-- Shop -->
            <button class="square-btn" on:click={() => toggleModal('shop')}>
                <Gem size={24} />
            </button>

            <!-- Skills -->
            <button class="square-btn" on:click={() => toggleModal('skills')}>
                <BarChart3 size={24} />
            </button>

            <!-- Crafting -->
            {#if selectedProfile.version === 'v2'}
                <button class="square-btn" on:click={() => toggleModal('crafting')}>
                    <Hammer size={24} />
                </button>
            {/if}

            <!-- Inventory (Rightmost) -->
            <button class="square-btn" on:click={() => toggleModal('inventory')}>
                <Backpack size={24} />
            </button>
        {/if}
    </footer>
</div>

<style>
    /* ... existing styles ... */
    
    .detail-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    
    .detail-header h3 {
        margin: 0;
        font-size: 1.2rem;
        color: white;
    }
    
    .back-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
    }
    
    .back-btn:hover {
        color: white;
    }
    
    .detail-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }
    
    .large-icon {
        width: 80px;
        height: 80px;
        background: #333;
        border-radius: 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        border: 1px solid #444;
    }
    
    .detail-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    
    .send-btn {
        background: #2563eb;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        transition: background 0.2s;
    }
    
    .send-btn:hover {
        background: #1d4ed8;
    }

    .fund-btn {
        width: 100%;
        background: #333;
        color: #aaa;
        border: 1px solid #444;
        padding: 0.5rem;
        border-radius: 8px;
        margin-top: 0.5rem;
        margin-bottom: 0;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .fund-btn:hover {
        background: #444;
        color: white;
    }
    
    .delete-btn {
        background: rgba(207, 102, 121, 0.1);
        color: #cf6679;
        border: 1px solid #cf6679;
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        transition: background 0.2s;
    }
    
    .delete-btn:hover {
        background: rgba(207, 102, 121, 0.2);
    }
    
    .delete-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .delete-icon-btn {
        color: #cf6679;
    }
    
    .delete-icon-btn:hover {
        color: #e57373;
    }

    .item-detail {
        animation: fadeIn 0.2s ease;
    }
    
    .item-card.owned {
        border-color: #4ade80;
        background: rgba(74, 222, 128, 0.05);
    }

    .item-card h4 {
        margin: 0;
        font-size: 0.9rem;
        color: #fff;
    }

    .item-card .desc {
        font-size: 0.7rem;
        color: #aaa;
        margin: 0;
        line-height: 1.2;
    }

    .owned-badge {
        background: #4ade80;
        color: black;
        font-size: 0.7rem;
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        margin-top: 0.5rem;
    }

    .action-btn {
        background: #2563eb;
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.8rem;
        width: 100%;
        margin-top: 0.5rem;
    }

    .action-btn:disabled {
        background: #333;
        color: #555;
        cursor: not-allowed;
    }
    
    .send-modal {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 280px;
    }
    
    .send-modal h3 {
        margin-top: 0;
        color: white;
        text-align: center;
    }
    
    .amount-presets {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .amount-presets button {
        flex: 1;
        background: #333;
        border: 1px solid #444;
        color: white;
        border-radius: 4px;
        padding: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    
    .confirm-btn {
        background: #2563eb;
        color: white;
        min-width: 80px; /* Ensure minimum width */
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px; /* Fixed height to prevent jump */
    }
    
    .confirm-btn-fixed {
        min-width: 80px;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
    }

    .input-group label {
        display: block;
        color: #aaa;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .skills-modal {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        max-height: 80vh;
        overflow-y: auto;
        min-width: unset; /* Override previous min-width */
        bottom: unset; /* Override previous bottom */
    }

    /* Shop Modal Styles */
    .shop-modal {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        max-height: 80vh;
        overflow-y: auto;
    }

    .charm-icon-wrapper {
        width: 48px;
        height: 48px;
        /* border-radius: 50%; */
        /* border: 2px solid; */
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 0; /* Removed margin to center perfectly */
        background: transparent;
        position: relative;
    }
    
    .charm-icon-wrapper.rock { /* border-color: #b0bec5; */ }
    .charm-icon-wrapper.tree { /* border-color: #4ade80; */ }
    
    .charm-icon-overlay {
        position: absolute;
        bottom: -2px;
        right: -2px;
        background: #1e1e1e;
        border-radius: 50%;
        padding: 2px;
    }

    .items-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .item-card {
        background: #252525;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.5rem;
        transition: transform 0.2s, border-color 0.2s;
    }

    .item-card.owned {
        border-color: #4ade80;
        background: rgba(74, 222, 128, 0.05);
    }

    .item-card h4 {
        margin: 0;
        font-size: 0.9rem;
        color: #fff;
    }

    .item-card .desc {
        font-size: 0.7rem;
        color: #aaa;
        margin: 0;
        line-height: 1.2;
    }

    .owned-badge {
        background: #4ade80;
        color: black;
        font-size: 0.7rem;
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        margin-top: 0.5rem;
    }

    .action-btn {
        background: #2563eb;
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.8rem;
        width: 100%;
        margin-top: 0.5rem;
    }

    .action-btn:disabled {
        background: #333;
        color: #555;
        cursor: not-allowed;
    }
    
    .skills-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .skill-box {
        background: #252525;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .skill-info {
        flex: 1; /* Ensure it takes remaining space */
        display: flex;
        flex-direction: column;
    }

    .skill-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
    }
    
    .skill-label {
        font-weight: 600;
        color: #aaa;
        font-size: 0.9rem;
    }

    .skill-level {
        font-weight: bold;
        color: white;
        font-size: 0.9rem;
    }
    
    .xp-progress {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
    }
    
    .xp-bar-mini {
        flex: 1;
        height: 6px;
        background: #333;
        border-radius: 3px;
        overflow: hidden;
    }
    
    .xp-fill.purple {
        background: #9c27b0;
        height: 100%;
    }
    
    .xp-text-mini {
        font-size: 0.75rem;
        color: #666;
        min-width: 80px; /* Increased for longer text */
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    /* Copied from previous files */
    :global(body) {
        background-color: #121212;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
    }
    
    .app-container { max-width: 600px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    header, footer { min-height: 80px; height: 80px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: #121212; border-bottom: 1px solid #222; z-index: 100; }
    footer { border-bottom: none; border-top: 1px solid #222; }
    .app-icon { width: 56px; height: 56px; border-radius: 16px; overflow: hidden; border: 1px solid #333; }
    .app-icon img { width: 100%; height: 100%; object-fit: cover; }
    .header-left, .header-right, .footer-left, .footer-right { min-width: 56px; display: flex; align-items: center; }
    .header-left, .footer-left { justify-content: flex-start; }
    .header-right, .footer-right { justify-content: flex-end; }
    .header-center, .footer-center { flex: 1; display: flex; justify-content: center; }
    .square-btn { width: 56px; height: 56px; background: #1e1e1e; border: 1px solid #333; border-radius: 16px; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; }
    .square-btn:hover { background: #2a2a2a; border-color: #555; transform: translateY(-2px); }
    .title-card { min-height: 56px; height: 56px; display: flex; align-items: center; justify-content: center; padding: 0 2rem; background: #1e1e1e; border: 1px solid #333; border-radius: 16px; font-weight: bold; color: white; font-size: 1.2rem; }
    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 90; }
    .modal-content { position: fixed; background: #1e1e1e; min-width: 200px; border-radius: 16px; border: 1px solid #333; padding: 1rem; animation: fadeIn 0.2s ease-out; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 100; }
    .inventory-modal { bottom: 90px; right: 20px; }
    .profile-modal { top: 90px; right: 20px; max-width: 300px; }
    
    /* Fund Confirmation Modal */
    .fund-modal-backdrop {
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0, 0, 0, 0.6); 
        z-index: 200; /* Higher than others */
    }
    
    .fund-modal-content {
        position: fixed; 
        background: #1e1e1e; 
        min-width: 200px; 
        border-radius: 16px; 
        border: 1px solid #333; 
        padding: 1rem; 
        animation: fadeIn 0.2s ease-out; 
        box-shadow: 0 8px 32px rgba(0,0,0,0.5); 
        z-index: 210;
        max-width: 280px; 
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
    
    .fund-modal-content h3 {
        margin-top: 0;
    }

    /* Profile Modal Tweaks */
    .profile-info h3 {
        margin: 0 0 1rem 0;
        font-size: 1.2rem;
        color: white;
        text-align: center; /* Centered */
        /* Reduced top space implicitly by removing container padding if needed, but h3 margin is standard. */
        /* Container has padding: 1rem. Title is first child. */
    }
    
    .inventory-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 0.5rem; }
    .inventory-item { 
        background: #252525; 
        border-radius: 12px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        aspect-ratio: 1; 
        position: relative; 
        border: 1px solid #333;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
    }
    .inventory-item:hover {
        background: #2a2a2a;
        border-color: #555;
    }
    .inventory-item .item-count { position: absolute; top: 2px; right: 6px; font-size: 0.8rem; font-weight: bold; color: white; }
    .empty-state { grid-column: 1 / -1; text-align: center; color: #666; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    main { padding: 1rem; flex: 1; display: flex; flex-direction: column; position: relative; overflow-y: auto; }
    .welcome { text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; flex: 1; }
    .selection-screen { display: flex; flex-direction: column; flex: 1; width: 100%; justify-content: center; align-items: center; }
    .profiles-list { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; max-width: 300px; }
    .mint-btn { background: #1e1e1e; color: white; border: 1px solid #333; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; width: 100%; height: 56px; display: flex; justify-content: center; align-items: center; }
    .profile-card-btn { background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 0.75rem 1rem; cursor: pointer; color: white; width: 100%; height: 56px; display: flex; align-items: center; justify-content: center; }
    .gameplay-screen { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 1rem; flex: 1; justify-content: center; align-items: center; }
    .actions-container { display: flex; flex-direction: column; gap: 1rem; width: 100%; max-width: 280px; }
    .action-btn { width: 100%; padding: 0 1rem; border: none; border-radius: 12px; font-weight: bold; font-size: 1rem; cursor: pointer; height: 56px; display: flex; justify-content: center; align-items: center; gap: 0.75rem; }
    .action-btn.wood { background: #2e7d32; color: white; }
    .action-btn.ore { background: #b0bec5; color: black; }
    .action-btn.claim { background: #0288d1; color: white; }
    .error-banner { background: #cf6679; color: black; padding: 1rem; border-radius: 12px; margin-bottom: 1rem; text-align: center; }
    /* purple theme for xp */
    .toast.woodcutting-xp { background: #252525; border-left: 4px solid #9c27b0; color: #9c27b0; }
    .toast.mining-xp { background: #252525; border-left: 4px solid #9c27b0; color: #9c27b0; }
    .toast.item-received { background: #252525; border-left: 4px solid #ffd700; color: #ffd700; }
    .toast.level-up { background: #252525; border-left: 4px solid #9c27b0; color: #9c27b0; }
    .toast.item-log { background: #252525; border-left: 4px solid #4ade80; color: #4ade80; }
    .toast.item-ore { background: #252525; border-left: 4px solid #b0bec5; color: #b0bec5; }
    .toast.item-gold { background: #252525; border-left: 4px solid #ffd700; color: #ffd700; }
    .toast.item-wood-charm { background: #252525; border-left: 4px solid #4ade80; color: #4ade80; }
    .toast.item-mine-charm { background: #252525; border-left: 4px solid #b0bec5; color: #b0bec5; }
    .toast.mining-xp, .toast.woodcutting-xp {
        font-variant-numeric: tabular-nums;
    }
    .toast-container {
        position: absolute;
        top: 1rem;
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        pointer-events: none;
        z-index: 1000;
    }
    
    /* Override generic toast style for better visibility */
    .toast { 
        background: #252525; 
        color: white; 
        padding: 0.75rem 1.5rem; 
        border-radius: 12px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); 
        border: 1px solid #333;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        pointer-events: auto; /* Allow clicking toast if needed, though mostly for display */
    }
    .loading { text-align: center; color: #888; display: flex; flex-direction: column; justify-content: center; align-items: center; flex: 1; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    .spinner-small { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.1); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .info-row { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem; }
    .info-row .label { color: #888; }
    .info-row .value { color: #aaa; font-family: monospace; cursor: pointer; }
    .burn-section { margin-top: 1rem; display: flex; justify-content: center; border-top: 1px solid #333; padding-top: 1rem; }
    .burn-trigger-btn { 
        background: rgba(207, 102, 121, 0.1); 
        color: #cf6679; 
        border: 1px solid #cf6679; 
        padding: 0.5rem 1rem; 
        border-radius: 8px; 
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .burn-modal { 
        max-width: 280px; 
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
    .text-danger { color: #cf6679; margin-top: 0; }
    .burn-warning { font-size: 0.9rem; color: #aaa; margin-bottom: 1rem; }
    .input-group { margin-bottom: 1.5rem; }
    .confirm-input { background: #252525; border: 1px solid #444; padding: 0.75rem; border-radius: 8px; color: white; font-size: 1rem; width: 100%; box-sizing: border-box; }
    .modal-actions { display: flex; gap: 0.75rem; }
    .modal-actions button { flex: 1; padding: 0.75rem; border-radius: 8px; cursor: pointer; font-weight: bold; border: none; }
    .cancel-btn { background: #333; color: white; }
    .confirm-burn-btn { background: #cf6679; color: black; }
    
    /* New Styling Fixes */
    .inventory-item .item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    
    .crafting-modal, .quests-modal, .shop-modal {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        max-height: 80vh;
        overflow-y: auto;
    }

    .recipes-list, .quests-list, .items-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .recipe-card, .quest-card, .item-card {
        background: #252525;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .recipe-info, .quest-info, .item-info-col { flex: 1; display: flex; flex-direction: column; }
    .recipe-info h4, .quest-info h4, .item-card h4 { margin: 0 0 0.25rem 0; color: white; font-size: 0.9rem; font-weight: 600; }
    .cost, .cost-text { display: flex; flex-direction: column; font-size: 0.7rem; color: #aaa; margin: 0; }
    .cost-text { color: #aaa; font-weight: normal; }
    
    .craft-btn, .quest-btn, .action-btn { 
        background: #2563eb; 
        color: white; 
        border: none; 
        padding: 0.5rem 1rem; 
        border-radius: 6px; 
        cursor: pointer; 
        font-size: 0.8rem; 
        font-weight: bold;
        width: auto;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 70px;
    }
    
    .craft-btn:disabled, .quest-btn:disabled, .action-btn:disabled { 
        background: #333; 
        color: #666; 
        cursor: not-allowed; 
    }

    /* Remove duplicate quest-modal style if present, using shared one above */
    /* Clean up profile-btn and other styles if needed */
    
    .version-tag { font-size: 0.7rem; background: #333; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
    .profile-btn-content { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .version-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .version-badge.v1 { background: #555; color: #aaa; }
    .version-badge.v2 { background: #2563eb; color: white; }
    .migration-box { background: rgba(37, 99, 235, 0.1); border: 1px solid #2563eb; border-radius: 8px; padding: 1rem; margin-top: 1rem; text-align: center; }
    .migration-box p { margin: 0 0 0.5rem 0; color: #2563eb; font-weight: bold; }
    .migrate-btn { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; }
    .v1-migration-prompt { text-align: center; }
    .migrate-btn-large { background: #2563eb; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-weight: bold; font-size: 1.2rem; cursor: pointer; }

    .refresh-profile-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        background: transparent;
        border: 1px solid #333;
        color: #888;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: all 0.2s;
    }
    .refresh-profile-btn:hover {
        background: #2a2a2a;
        color: white;
        border-color: #555;
    }
    .refresh-profile-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .spinner-mini {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255,255,255,0.1);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    /* Void Modal */
    .void-modal { 
        border-color: #9c27b0; 
        max-height: 80vh; 
        display: flex; 
        flex-direction: column;
        /* Centering Logic */
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%);
        bottom: auto;
        right: auto;
        max-width: 320px;
        width: 90%;
        padding-bottom: 1rem;
    }
    .void-header { text-align: center; margin-bottom: 0.5rem; padding-top: 0; }
    .void-header h3 { color: #e1bee7; margin: 0 0 0.5rem 0; }
    .void-stats { display: flex; justify-content: center; gap: 1rem; margin-bottom: 0.5rem; }
    .stat-box { display: flex; flex-direction: column; align-items: center; background: rgba(156, 39, 176, 0.1); padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid #9c27b0; }
    .stat-box .label { font-size: 0.7rem; color: #e1bee7; text-transform: uppercase; }
    .stat-box .value { font-size: 1.5rem; font-weight: bold; color: white; }
    
    .void-actions { margin-bottom: 0.5rem; }
    
    .sacrifice-buttons { display: flex; flex-direction: column; gap: 0.5rem; }
    .sacrifice-btn { 
        background: #333; 
        color: #666; 
        border: none; 
        border-radius: 6px; 
        padding: 0.5rem 1rem; 
        font-weight: bold; 
        font-size: 0.8rem; 
        cursor: not-allowed; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        min-width: 70px; 
        width: auto; 
        margin: 0; /* Remove explicit margin-top to let flex gap handle it */
    }
    .sacrifice-btn:enabled { background: #9c27b0; color: white; cursor: pointer; }
    .sacrifice-btn:disabled { background: #333 !important; color: #666 !important; cursor: not-allowed; }
    
    .cost-box-grey {
        background: #2a2a2a;
        padding: 8px 12px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        min-width: 80px;
    }

    .leaderboard-section { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding-top: 0.5rem; }
    .leaderboard-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 4px; max-height: 200px; }
    .leaderboard-row { display: flex; align-items: center; padding: 0.5rem; background: #252525; border-radius: 6px; border: 1px solid #333; }
    .leaderboard-row.highlight { border-color: #9c27b0; background: rgba(156, 39, 176, 0.1); }
    .leaderboard-row .rank { font-weight: bold; color: #888; width: 30px; }
    .leaderboard-row .name { flex: 1; color: white; font-size: 0.9rem; }
    .leaderboard-row .level { font-weight: bold; color: #e1bee7; }
</style>

