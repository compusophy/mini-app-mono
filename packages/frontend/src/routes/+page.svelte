<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { sdk } from '@farcaster/miniapp-sdk';
  import { config } from '$lib/wagmi';
  import { connect, getAccount, watchAccount, getWalletClient, getPublicClient } from '@wagmi/core';
  import type { Address } from 'viem';
  import { ABIS } from '$lib/abis';
  import addresses from '$lib/addresses.json';
  import { Backpack, User, Axe, Pickaxe, Coins, TreeDeciduous, Mountain, ArrowLeft, BarChart3, Trophy } from '@lucide/svelte';

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
  };

  // State
  let account: Address | null = null;
  let profiles: Profile[] = [];
  let selectedProfileId: bigint | null = null;
  
  let loading = false; // For minting
  let isLoadingProfiles = false;
  let isInitializing = true;
  let showInventory = false;
  let showProfile = false;
  let showSkills = false;
  let showLeaderboard = false;
  let leaderboardProfiles: Profile[] = [];
  let isLoadingLeaderboard = false;
  let leaderboardTab: 'overall' | 'woodcutting' | 'mining' = 'overall';
  let errorMsg: string | null = null;
  type Toast = {
    id: number;
    msg: string;
    type: 'default' | 'woodcutting-xp' | 'mining-xp' | 'inventory' | 'error';
  };
  let toasts: Toast[] = [];
  let toastIdCounter = 0;
  
  let actionLoading: string | null = null; // 'chop', 'mine', 'claim'

  // Burn Logic
  let showBurnConfirmation = false;
  let burnConfirmationInput = '';
  let isBurning = false;

  // Derived
  $: selectedProfile = selectedProfileId !== null ? profiles.find(p => p.id === selectedProfileId) : null;

  // Helper: XP Calculation
  // Level = 1 + sqrt(xp / 100)
  // Next Level XP = 100 * (CurrentLevel)^2
  function getNextLevelXp(level: bigint): bigint {
    return 100n * (level * level);
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
        // This MUST be called for the mini app to work correctly
        await sdk.actions.ready();
    } catch (e) {
        console.log("Not in Mini App environment or SDK error:", e);
    }

    watchAccount(config, {
        onChange(data) {
            if (!isMounted) return;
            const prevAccount = account;
            account = data.address ?? null;
            if (account && account !== prevAccount) {
                loadProfiles();
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
    };
  });

  async function connectWallet() {
      errorMsg = null;
      try {
        const isMiniApp = await sdk.isInMiniApp();
        if (!isMiniApp) {
            // Allow connecting outside miniapp for dev testing if needed, but warn
             await connect(config, { connector: config.connectors[0] });
             return;
        }
        await connect(config, { connector: config.connectors[0] });
      } catch (error: any) {
        console.error("Error connecting wallet:", error);
        errorMsg = error.message || "Failed to connect wallet.";
      }
  }

  async function loadLeaderboard() {
    if (isLoadingLeaderboard) return;
    isLoadingLeaderboard = true;
    const publicClient = getPublicClient(config);
    if (!publicClient) {
        isLoadingLeaderboard = false;
        return;
    }
    
    if (!CONTRACT_ADDRESSES.SkillerProfile || !CONTRACT_ADDRESSES.SkillerMining || !CONTRACT_ADDRESSES.SkillerChopping) {
        isLoadingLeaderboard = false;
        return;
    }

    try {
        const total = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'totalSupply',
        });

        // 1. Get all Token IDs
        const tokenByIndexCalls = [];
        for (let i = 0n; i < total; i++) {
            tokenByIndexCalls.push({
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'tokenByIndex',
                args: [i]
            });
        }
        
        const tokenIdsResults = await publicClient.multicall({ contracts: tokenByIndexCalls });
        const tokenIds = tokenIdsResults.map(r => r.result as bigint);

        // 2. Prepare calls for data
        const miningLevelCalls = tokenIds.map(id => ({
            address: CONTRACT_ADDRESSES.SkillerMining as Address,
            abi: ABIS.SkillerMining,
            functionName: 'getLevel',
            args: [id]
        }));
        
        const miningXpCalls = tokenIds.map(id => ({
            address: CONTRACT_ADDRESSES.SkillerMining as Address,
            abi: ABIS.SkillerMining,
            functionName: 'profileXp',
            args: [id]
        }));

        const woodLevelCalls = tokenIds.map(id => ({
            address: CONTRACT_ADDRESSES.SkillerChopping as Address,
            abi: ABIS.SkillerChopping,
            functionName: 'getLevel',
            args: [id]
        }));

        const woodXpCalls = tokenIds.map(id => ({
            address: CONTRACT_ADDRESSES.SkillerChopping as Address,
            abi: ABIS.SkillerChopping,
            functionName: 'profileXp',
            args: [id]
        }));
        
        const [mLevels, mXps, wLevels, wXps] = await Promise.all([
            publicClient.multicall({ contracts: miningLevelCalls }),
            publicClient.multicall({ contracts: miningXpCalls }),
            publicClient.multicall({ contracts: woodLevelCalls }),
            publicClient.multicall({ contracts: woodXpCalls })
        ]);

        // 3. Map to Profile objects
        leaderboardProfiles = tokenIds.map((id, index) => {
            return {
                id: id,
                image: '',
                tba: '0x0000000000000000000000000000000000000000', // Placeholder
                axeBalance: 0n,
                woodBalance: 0n,
                pickaxeBalance: 0n,
                oreBalance: 0n,
                goldBalance: 0n,
                miningLevel: mLevels[index].status === 'success' ? mLevels[index].result as bigint : 1n,
                miningXp: mXps[index].status === 'success' ? mXps[index].result as bigint : 0n,
                woodcuttingLevel: wLevels[index].status === 'success' ? wLevels[index].result as bigint : 1n,
                woodcuttingXp: wXps[index].status === 'success' ? wXps[index].result as bigint : 0n,
            };
        });
        
    } catch(e) {
        console.error("Error loading leaderboard:", e);
    } finally {
        isLoadingLeaderboard = false;
    }
  }

  $: if (showLeaderboard) {
      loadLeaderboard();
  }

  $: fullSortedLeaderboard = [...leaderboardProfiles].sort((a, b) => {
      if (leaderboardTab === 'overall') {
          const totalLevelA = (a.miningLevel || 0n) + (a.woodcuttingLevel || 0n);
          const totalLevelB = (b.miningLevel || 0n) + (b.woodcuttingLevel || 0n);
          if (totalLevelA !== totalLevelB) {
              return Number(totalLevelB - totalLevelA);
          }
          // Tie-breaker: Total XP
          const totalXpA = (a.miningXp || 0n) + (a.woodcuttingXp || 0n);
          const totalXpB = (b.miningXp || 0n) + (b.woodcuttingXp || 0n);
          return Number(totalXpB - totalXpA);
      } else if (leaderboardTab === 'woodcutting') {
          return Number((b.woodcuttingXp || 0n) - (a.woodcuttingXp || 0n));
      } else {
          return Number((b.miningXp || 0n) - (a.miningXp || 0n));
      }
  });

  $: sortedLeaderboard = fullSortedLeaderboard.slice(0, 10);
  
  $: userRank = selectedProfileId !== null ? fullSortedLeaderboard.findIndex(p => p.id === selectedProfileId) + 1 : 0;

  async function loadProfiles(silent = false) {
    if (!account) return;
    const publicClient = getPublicClient(config);
    if (!publicClient) return;

    if (!silent) isLoadingProfiles = true;

    try {
        const balance = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SkillerProfile as Address,
          abi: ABIS.SkillerProfile,
          functionName: 'balanceOf',
          args: [account]
        });

        const loadedProfiles: Profile[] = [];
        
        for (let i = 0n; i < balance; i++) {
            const tokenId = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'tokenOfOwnerByIndex',
                args: [account, i]
            });
            
            const profileData = await getProfileData(tokenId, publicClient);
            loadedProfiles.push(profileData);
        }

        profiles = loadedProfiles;
    } catch (e) {
        console.error("Error loading profiles:", e);
        errorMsg = `Failed to load profiles: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        if (!silent) isLoadingProfiles = false;
    }
  }

  async function getProfileData(tokenId: bigint, publicClient: any): Promise<Profile> {
    const chainIdFromNetwork = await publicClient.getChainId();

    const tbaAddress = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.ERC6551Registry as Address,
        abi: ABIS.ERC6551Registry,
        functionName: 'account',
        args: [
            CONTRACT_ADDRESSES.ERC6551Account as Address,
            0n,
            BigInt(chainIdFromNetwork),
            CONTRACT_ADDRESSES.SkillerProfile as Address,
            tokenId
        ]
    });

    let axeBalance = 0n;
    let woodBalance = 0n;
    let pickaxeBalance = 0n;
    let oreBalance = 0n;
    let goldBalance = 0n;
    
    let miningLevel = 1n;
    let miningXp = 0n;
    let woodcuttingLevel = 1n;
    let woodcuttingXp = 0n;

    try {
        // Read Items (101, 201, 102, 202) & Gold
        const promises = [
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerItems as Address,
                abi: ABIS.SkillerItems,
                functionName: 'balanceOf',
                args: [tbaAddress, 101n]
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerItems as Address,
                abi: ABIS.SkillerItems,
                functionName: 'balanceOf',
                args: [tbaAddress, 201n]
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerItems as Address,
                abi: ABIS.SkillerItems,
                functionName: 'balanceOf',
                args: [tbaAddress, 102n]
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerItems as Address,
                abi: ABIS.SkillerItems,
                functionName: 'balanceOf',
                args: [tbaAddress, 202n]
            })
        ];

        if (CONTRACT_ADDRESSES.SkillerGold) {
            promises.push(
                publicClient.readContract({
                    address: CONTRACT_ADDRESSES.SkillerGold as Address,
                    abi: ABIS.SkillerGold,
                    functionName: 'balanceOf',
                    args: [tbaAddress]
                })
            );
        }

        const results = await Promise.all(promises);
        axeBalance = results[0] as bigint;
        woodBalance = results[1] as bigint;
        pickaxeBalance = results[2] as bigint;
        oreBalance = results[3] as bigint;
        
        if (CONTRACT_ADDRESSES.SkillerGold) {
            goldBalance = results[4] as bigint;
        }

        // Read Mining XP/Level
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

        // Read Woodcutting XP/Level
        if (CONTRACT_ADDRESSES.SkillerChopping) {
            // Check if getLevel exists on Chopping (it does based on our check)
            woodcuttingLevel = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerChopping as Address,
                abi: ABIS.SkillerChopping,
                functionName: 'getLevel',
                args: [tokenId]
            });
            // Check profileXp on Chopping
             woodcuttingXp = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerChopping as Address,
                abi: ABIS.SkillerChopping,
                functionName: 'profileXp',
                args: [tokenId]
            });
        }

    } catch (e) {
        console.error("Error reading items/xp:", e);
    }

    return {
        id: tokenId,
        image: '', // Not used
        tba: tbaAddress,
        axeBalance,
        woodBalance,
        pickaxeBalance,
        oreBalance,
        goldBalance,
        miningLevel,
        miningXp,
        woodcuttingLevel,
        woodcuttingXp
    };
  }

  async function handleAction(action: 'chop' | 'mine' | 'claim', tokenId: bigint) {
    if (!account || actionLoading) return;
    actionLoading = action;
    errorMsg = null;

    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        if (!walletClient || !publicClient) throw new Error("Wallet not connected");

        let address: Address;
        let abi: any;
        let functionName: string;

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

        const { request } = await publicClient.simulateContract({
            account,
            address,
            abi,
            functionName,
            args: [tokenId]
        });

        const hash = await walletClient.writeContract(request);
        showToast('Transaction Sent...');
        
        await publicClient.waitForTransactionReceipt({ hash });
        
        // Wait a bit for indexing
        await new Promise(r => setTimeout(r, 2000));
        
        const prevXp = action === 'chop' ? selectedProfile?.woodcuttingXp : selectedProfile?.miningXp;
        await loadProfiles(true);
        leaderboardProfiles = []; // Force refresh of leaderboard to reflect new stats
        
        if (selectedProfileId) {
            const updatedProfile = profiles.find(p => p.id === selectedProfileId);
            if (updatedProfile) {
                if (action === 'chop') {
                    const gained = (updatedProfile.woodcuttingXp || 0n) - (prevXp || 0n);
                    if (gained > 0n) showToast(`+${gained} Woodcutting XP`, 'woodcutting-xp');
                    showToast(`+1 Oak Log`, 'inventory');
                } else if (action === 'mine') {
                    const gained = (updatedProfile.miningXp || 0n) - (prevXp || 0n);
                    if (gained > 0n) showToast(`+${gained} Mining XP`, 'mining-xp');
                    showToast(`+1 Iron Ore`, 'inventory');
                } else {
                    showToast('Pickaxe Claimed!', 'inventory');
                }
            }
        }

    } catch (e: any) {
        console.error(`Error ${action}:`, e);
        // Shorten error message for toast
        if (e.message?.includes("User rejected") || e.message?.includes("User denied")) {
            showToast("Transaction Cancelled", 'error');
        } else {
            showToast(`Failed to ${action}`, 'error');
        }
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
        if (!walletClient || !publicClient) throw new Error("Wallet not connected");

        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'safeMint',
            args: [account]
        });
        const hash = await walletClient.writeContract(request);
        showToast('Minting...');
        await publicClient.waitForTransactionReceipt({ hash });
        
        await new Promise(r => setTimeout(r, 2000));
        await loadProfiles(true);
        leaderboardProfiles = []; // Force refresh of leaderboard
        showToast('Character Created!');
    } catch (e: any) {
        console.error("Error creating profile:", e);
        if (e.message?.includes("User rejected") || e.message?.includes("User denied")) {
            showToast("Transaction Cancelled", 'error');
        } else {
            showToast("Failed to create profile", 'error');
        }
    } finally {
        loading = false;
    }
  }

  async function burnCharacter() {
    if (!selectedProfile || !account) return;
    if (burnConfirmationInput.trim().toLowerCase() !== 'yes') {
        showToast('Please type "yes" to confirm', 'error');
        return;
    }

    isBurning = true;
    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        if (!walletClient || !publicClient) throw new Error("Wallet not connected");

        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'transferFrom',
            args: [account, '0x000000000000000000000000000000000000dEaD', selectedProfile.id]
        });
        
        const hash = await walletClient.writeContract(request);
        showToast('Burning character...', 'default');
        await publicClient.waitForTransactionReceipt({ hash });
        
        showToast('Character burned successfully', 'default');
        
        showBurnConfirmation = false;
        showProfile = false;
        selectedProfileId = null;
        loadProfiles();
    } catch (e: any) {
        console.error("Burn error:", e);
        if (e.message?.includes("User rejected") || e.message?.includes("User denied")) {
            showToast("Transaction Cancelled", 'error');
        } else {
            showToast(`Burn failed: ${e.message}`, 'error');
        }
    } finally {
        isBurning = false;
        burnConfirmationInput = '';
    }
  }
</script>

<div class="app-container">
    <header>
        <div class="header-left">
            {#if selectedProfile}
                <button class="square-btn" on:click={() => selectedProfileId = null}>
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
                {:else}
                    SKILLER
                {/if}
            </div>
        </div>
        <div class="header-right">
            {#if selectedProfile}
                <button class="square-btn" on:click={() => showProfile = !showProfile}>
                    <User size={24} />
                </button>
            {:else if account}
                 <button class="square-btn" on:click={() => showProfile = !showProfile}>
                    <User size={24} />
                </button>
            {/if}
        </div>
    </header>

    {#if showLeaderboard}
        <div class="modal-backdrop" on:click={() => showLeaderboard = false}>
            <div class="modal-content leaderboard-modal" on:click|stopPropagation>
                <div class="leaderboard-tabs">
                    <button class="tab-btn" class:active={leaderboardTab === 'overall'} on:click={() => leaderboardTab = 'overall'}>
                        Total
                    </button>
                    <button class="tab-btn" class:active={leaderboardTab === 'woodcutting'} on:click={() => leaderboardTab = 'woodcutting'}>
                        <TreeDeciduous size={18} color="#4ade80" />
                    </button>
                    <button class="tab-btn" class:active={leaderboardTab === 'mining'} on:click={() => leaderboardTab = 'mining'}>
                        <Mountain size={18} color="#5d4037" />
                    </button>
                </div>
                
                {#if selectedProfile && userRank > 0}
                    <div class="user-rank-display">
                        <span class="rank-label">Your Rank:</span>
                        <span class="rank-value">#{userRank}</span>
                    </div>
                {/if}
                
                <div class="leaderboard-list">
                    {#if isLoadingLeaderboard && leaderboardProfiles.length === 0}
                        <div class="loading-container">
                            <div class="spinner-small"></div>
                        </div>
                    {:else}
                        <div class="leaderboard-header-row">
                            <span class="col-rank">#</span>
                            <span class="col-player">Player</span>
                            <span class="col-lvl">Lvl</span>
                        </div>
                        <div class="leaderboard-scroll">
                            {#each sortedLeaderboard as profile, i}
                                <div class="leaderboard-row" class:self={selectedProfile && profile.id === selectedProfile.id}>
                                    <span class="col-rank">{i + 1}</span>
                                    <span class="col-player">SKILLER #{profile.id}</span>
                                    <span class="col-lvl">
                                        {#if leaderboardTab === 'overall'}
                                            {(profile.miningLevel || 0n) + (profile.woodcuttingLevel || 0n)}
                                        {:else if leaderboardTab === 'woodcutting'}
                                            {profile.woodcuttingLevel}
                                        {:else}
                                            {profile.miningLevel}
                                        {/if}
                                    </span>
                                </div>
                            {/each}
                             {#if sortedLeaderboard.length === 0}
                                <div class="empty-state">No profiles found</div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if showInventory && selectedProfile}
        <div class="modal-backdrop" on:click={() => showInventory = false}>
            <div class="modal-content inventory-modal" on:click|stopPropagation>
                <div class="inventory-grid">
                    {#if selectedProfile.goldBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon"><Coins size={32} color="#fbbf24" /></span>
                            <span class="item-count">{Number(selectedProfile.goldBalance) / 1e18}</span>
                        </div>
                    {/if}
                    {#if selectedProfile.axeBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon"><Axe size={32} color="#9ca3af" /></span>
                        </div>
                    {/if}
                    {#if selectedProfile.woodBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon"><TreeDeciduous size={32} color="#4ade80" /></span>
                            <span class="item-count">{selectedProfile.woodBalance}</span>
                        </div>
                    {/if}
                    {#if selectedProfile.pickaxeBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon"><Pickaxe size={32} color="#9ca3af" /></span>
                        </div>
                    {/if}
                    {#if selectedProfile.oreBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon"><Mountain size={32} color="#5d4037" /></span>
                            <span class="item-count">{selectedProfile.oreBalance}</span>
                        </div>
                    {/if}
                    
                    {#if selectedProfile.axeBalance === 0n && selectedProfile.woodBalance === 0n && selectedProfile.pickaxeBalance === 0n && selectedProfile.oreBalance === 0n && selectedProfile.goldBalance === 0n}
                        <div class="empty-state">Empty</div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if showSkills && selectedProfile}
        <div class="modal-backdrop" on:click={() => showSkills = false}>
            <div class="modal-content skills-modal" on:click|stopPropagation>
                <div class="skills-list">
                    <div class="skill-box">
                        <span class="skill-icon"><TreeDeciduous size={24} color="#4ade80" /></span>
                        <div class="skill-info">
                            <div class="skill-header">
                                <span class="skill-label">Woodcutting</span>
                                <span class="skill-level">Level {selectedProfile.woodcuttingLevel}</span>
                            </div>
                            <div class="xp-progress">
                                <div class="xp-bar-mini">
                                    <div class="xp-fill" style="width: {(Number(selectedProfile.woodcuttingXp) / Number(getNextLevelXp(selectedProfile.woodcuttingLevel))) * 100}%"></div>
                                </div>
                                <span class="xp-text-mini">{selectedProfile.woodcuttingXp} XP</span>
                            </div>
                        </div>
                    </div>

                    <div class="skill-box">
                        <span class="skill-icon"><Mountain size={24} color="#5d4037" /></span>
                        <div class="skill-info">
                            <div class="skill-header">
                                <span class="skill-label">Mining</span>
                                <span class="skill-level">Level {selectedProfile.miningLevel}</span>
                            </div>
                            <div class="xp-progress">
                                <div class="xp-bar-mini">
                                    <div class="xp-fill" style="width: {(Number(selectedProfile.miningXp) / Number(getNextLevelXp(selectedProfile.miningLevel))) * 100}%"></div>
                                </div>
                                <span class="xp-text-mini">{selectedProfile.miningXp} XP</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if showProfile}
        <div class="modal-backdrop" on:click={() => showProfile = false}>
            <div class="modal-content profile-modal" on:click|stopPropagation>
                <div class="profile-info">
                    {#if selectedProfile}
                        <h3>SKILLER #{selectedProfile.id}</h3>
                    {:else}
                         <h3>Player Profile</h3>
                    {/if}
                    <div class="info-row">
                        <span class="label">User:</span>
                        <span class="value" on:click={() => copyToClipboard(account || '')}>{truncateAddress(account || '')}</span>
                    </div>
                    {#if selectedProfile}
                        <div class="info-row">
                            <span class="label">TBA:</span>
                            <span class="value" on:click={() => copyToClipboard(selectedProfile.tba)}>{truncateAddress(selectedProfile.tba)}</span>
                        </div>
                        <div class="burn-section">
                            <button class="burn-trigger-btn" on:click={() => showBurnConfirmation = true}>Burn Character</button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if showBurnConfirmation}
        <div class="modal-backdrop" on:click={() => showBurnConfirmation = false}>
            <div class="modal-content burn-modal" on:click|stopPropagation>
                <h3 class="text-danger">Burn Character?</h3>
                <p class="burn-warning">This action is irreversible. Your character and all its progress/items will be lost forever.</p>
                <div class="input-group">
                    <label for="burn-confirm">Type <strong>yes</strong> to confirm:</label>
                    <input id="burn-confirm" type="text" bind:value={burnConfirmationInput} placeholder="yes" class="confirm-input" />
                </div>
                
                <div class="modal-actions">
                    <button class="cancel-btn" on:click={() => showBurnConfirmation = false} disabled={isBurning}>Cancel</button>
                    <button class="confirm-burn-btn" on:click={burnCharacter} disabled={isBurning || burnConfirmationInput.toLowerCase() !== 'yes'}>
                        {#if isBurning}
                            <div class="spinner-small"></div>
                        {:else}
                            Burn Forever
                        {/if}
                    </button>
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
        {:else if !account}
            <div class="welcome">
                <h1>Welcome to SKILLER</h1>
                <p>Connect your wallet to play.</p>
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
                            <h3>SKILLER #{profile.id}</h3>
                        </button>
                    {/each}
                </div>
            </div>
        {:else}
            <!-- Gameplay Screen -->
            <div class="gameplay-screen">
                <!-- Actions Container -->
                <div class="actions-container">
                    <button 
                        class="action-btn wood" 
                        disabled={selectedProfile.axeBalance === 0n || !!actionLoading}
                        on:click={() => handleAction('chop', selectedProfile.id)}
                    >
                        {#if actionLoading === 'chop'}
                            <div class="spinner-small"></div>
                        {:else if selectedProfile.axeBalance === 0n}
                            Need Axe
                        {:else}
                            <TreeDeciduous size={20} /> Chop Tree
                        {/if}
                    </button>

                    {#if selectedProfile.pickaxeBalance > 0n}
                        <button 
                            class="action-btn ore" 
                            disabled={!!actionLoading}
                            on:click={() => handleAction('mine', selectedProfile.id)}
                        >
                            {#if actionLoading === 'mine'}
                                <div class="spinner-small"></div>
                            {:else}
                                <Mountain size={20} /> Mine Ore
                            {/if}
                        </button>
                    {:else}
                        <button 
                            class="action-btn claim"
                            disabled={!!actionLoading}
                            on:click={() => handleAction('claim', selectedProfile.id)}
                        >
                            {#if actionLoading === 'claim'}
                                <div class="spinner-small"></div>
                            {:else}
                                <Pickaxe size={20} /> Claim Pickaxe
                            {/if}
                        </button>
                    {/if}
                </div>
            </div>
        {/if}
    </main>

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
            <div class="footer-left">
                <button class="square-btn" on:click={() => showLeaderboard = !showLeaderboard}>
                    <Trophy size={24} />
                </button>
            </div>
            <div class="footer-center">
                <button class="square-btn" on:click={() => showSkills = !showSkills}>
                    <BarChart3 size={24} />
                </button>
            </div>
            <div class="footer-right">
                <button class="square-btn" on:click={() => showInventory = !showInventory}>
                    <Backpack size={24} />
                </button>
            </div>
        {/if}
    </footer>
</div>

<style>
    :global(body) {
        background-color: #121212;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
    }

    .app-container {
        max-width: 600px;
        margin: 0 auto;
        height: 100vh; /* Fixed to viewport height */
        display: flex;
        flex-direction: column;
        overflow: hidden; /* Prevent outer scroll */
    }

    header, footer {
        min-height: 80px;
        height: 80px;
        max-height: 80px;
        padding: 0 12px; /* Match vertical spacing: (80px - 56px) / 2 = 12px */
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        background: #121212;
        border-bottom: 1px solid #222; /* Subtle separation */
        z-index: 10;
    }

    footer {
        border-bottom: none;
        border-top: 1px solid #222;
    }

    .app-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid #333;
    }

    .app-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .header-left, .header-right, .footer-left, .footer-right {
        width: 56px; /* Match button width to reserve space */
        display: flex;
        align-items: center;
    }
    
    .header-left, .footer-left {
        justify-content: flex-start;
    }
    
    .header-right, .footer-right {
        justify-content: flex-end;
    }

    .header-center, .footer-center {
        flex: 1;
        display: flex;
        justify-content: center;
    }

    .square-btn {
        width: 56px;
        height: 56px;
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 16px;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        padding: 0;
    }

    .square-btn:hover {
        background: #2a2a2a;
        border-color: #555;
        transform: translateY(-2px);
    }

    .square-btn:active {
        transform: scale(0.95);
    }

    .title-card {
        min-height: 56px;
        height: 56px;
        max-height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 2rem;
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 16px;
        font-weight: bold;
        color: white;
        font-size: 1.2rem;
        line-height: 1;
        box-sizing: border-box;
    }

    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5); /* Dim background */
        pointer-events: auto;
        z-index: 90;
    }

    .modal-content {
        position: fixed;
        background: #1e1e1e;
        width: auto;
        min-width: 200px;
        max-width: 300px;
        border-radius: 16px;
        border: 1px solid #333;
        padding: 1rem;
        animation: fadeIn 0.2s ease-out;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 100;
    }

    .inventory-modal {
        bottom: 90px; /* Above the footer */
        right: 20px;
    }

    .leaderboard-modal {
        bottom: 90px;
        left: 20px;
        width: 280px;
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        max-height: 500px;
    }

    .leaderboard-tabs {
        display: flex;
        background: #252525;
        border-bottom: 1px solid #333;
    }

    .user-rank-display {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0.75rem;
        background: #222;
        border-bottom: 1px solid #333;
        gap: 0.5rem;
    }
    
    .rank-label {
        color: #888;
        font-size: 0.9rem;
    }
    
    .rank-value {
        color: #fbbf24;
        font-weight: bold;
        font-size: 1.1rem;
    }

    .tab-btn {
        flex: 1;
        background: transparent;
        border: none;
        color: #888;
        padding: 12px;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: all 0.2s;
        border-bottom: 2px solid transparent;
        font-weight: bold;
        font-size: 0.9rem;
    }

    .tab-btn:hover {
        color: #aaa;
        background: #2a2a2a;
    }

    .tab-btn.active {
        color: white;
        border-bottom-color: #2563eb;
        background: #2a2a2a;
    }

    .leaderboard-list {
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
    }
    
    .loading-container {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }

    .leaderboard-header-row {
        display: flex;
        padding: 0.5rem;
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        border-bottom: 1px solid #333;
        margin-bottom: 0.25rem;
    }

    .leaderboard-scroll {
        overflow-y: auto;
        flex: 1;
    }

    .leaderboard-row {
        display: flex;
        padding: 0.5rem;
        font-size: 0.9rem;
        border-radius: 8px;
        color: #ccc;
        align-items: center;
    }
    
    .leaderboard-row:nth-child(even) {
        background: rgba(255,255,255,0.03);
    }
    
    .leaderboard-row.self {
        background: rgba(37, 99, 235, 0.2);
        color: white;
        border: 1px solid rgba(37, 99, 235, 0.4);
    }

    .col-rank {
        width: 30px;
        text-align: center;
        font-weight: bold;
        color: #666;
    }
    
    .leaderboard-row .col-rank {
        color: #888;
    }
    
    .leaderboard-row:nth-child(1) .col-rank { color: #fbbf24; } /* Gold */
    .leaderboard-row:nth-child(2) .col-rank { color: #9ca3af; } /* Silver */
    .leaderboard-row:nth-child(3) .col-rank { color: #b45309; } /* Bronze */

    .col-player {
        flex: 1;
        padding-left: 0.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .col-lvl {
        width: 40px;
        text-align: right;
        font-weight: bold;
        color: white;
    }

    .profile-modal {
        top: 90px; /* Below the header */
        right: 20px;
    }

    .skills-modal {
        bottom: 90px; /* Above the footer */
        left: 50%;
        transform: translateX(-50%);
        min-width: 320px;
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

    .skill-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
    }

    .skill-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 0.25rem;
    }

    .skill-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
    }

    .skill-label {
        font-size: 0.8rem;
        color: #aaa;
        font-weight: 600;
    }

    .skill-level {
        font-size: 0.9rem;
        font-weight: bold;
        color: white;
    }

    .xp-progress {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .xp-bar-mini {
        flex: 1;
        height: 4px;
        background: #333;
        border-radius: 2px;
        overflow: hidden;
    }

    .xp-text-mini {
        font-size: 0.7rem;
        color: #666;
        min-width: 40px;
        text-align: right;
    }

    .profile-info h3 {
        margin: 0 0 1rem 0;
        font-size: 1.2rem;
        color: white;
        text-align: center;
    }

    .info-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }

    .info-row .label {
        color: #888;
    }

    .info-row .value {
        color: #aaa;
        font-family: monospace;
        cursor: pointer;
    }

    .info-row .value:hover {
        color: white;
        text-decoration: underline;
    }

    .burn-section {
        margin-top: 1.5rem;
        display: flex;
        justify-content: center;
        border-top: 1px solid #333;
        padding-top: 1rem;
    }

    .burn-trigger-btn {
        background: rgba(207, 102, 121, 0.1);
        color: #cf6679;
        border: 1px solid #cf6679;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.2s;
    }

    .burn-trigger-btn:hover {
        background: #cf6679;
        color: black;
    }

    .burn-modal {
        z-index: 110; /* Higher than profile modal */
        max-width: 280px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .text-danger {
        color: #cf6679;
        margin-top: 0;
    }

    .burn-warning {
        font-size: 0.9rem;
        color: #aaa;
        margin-bottom: 1rem;
    }

    .input-group {
        margin-bottom: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .confirm-input {
        background: #252525;
        border: 1px solid #444;
        padding: 0.75rem;
        border-radius: 8px;
        color: white;
        font-size: 1rem;
    }

    .confirm-input:focus {
        outline: none;
        border-color: #cf6679;
    }

    .modal-actions {
        display: flex;
        gap: 0.75rem;
    }

    .modal-actions button {
        flex: 1;
        padding: 0.75rem;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        border: none;
        transition: opacity 0.2s;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 44px;
    }

    .cancel-btn {
        background: #333;
        color: white;
    }
    .cancel-btn:hover:not(:disabled) { background: #444; }

    .confirm-burn-btn {
        background: #cf6679;
        color: black;
    }
    .confirm-burn-btn:hover:not(:disabled) { background: #e57373; }
    .confirm-burn-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .inventory-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 0.5rem;
    }

    .inventory-item {
        background: #252525;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 1;
        position: relative;
        border: 1px solid #333;
    }

    .inventory-item .item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }

    .inventory-item .item-count {
        position: absolute;
        top: 2px;
        right: 6px;
        font-size: 0.8rem;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 2px black;
    }

    .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        color: #666;
        padding: 1rem;
        font-style: italic;
        font-size: 0.9rem;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    main {
        padding: 1rem;
        flex: 1;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow-y: auto; /* Scrollable main content */
    }

    .welcome {
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        flex: 1;
    }

    /* Selection Screen */
    .selection-screen {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        justify-content: center;
        align-items: center;
    }

    /* List container */
    .profiles-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
        max-width: 300px;
    }

    .mint-btn {
        background: #1e1e1e;
        color: white;
        border: 1px solid #333;
        border-radius: 12px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        width: 100%;
        height: 56px;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: all 0.2s;
    }
    .mint-btn:hover:not(:disabled) { 
        background: #2a2a2a; 
        border-color: #555;
    }
    .mint-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .profile-card-btn {
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 0.75rem 1rem;
        cursor: pointer;
        transition: all 0.2s;
        color: white;
        width: 100%;
        text-align: center;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Gameplay Screen */
    .gameplay-screen {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-top: 1rem;
        flex: 1;
        justify-content: center;
        align-items: center;
    }

    /* Actions Container */
    .actions-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        max-width: 280px;
    }

    .stat-card {
        background: #1e1e1e;
        padding: 1rem;
        border-radius: 12px;
        text-align: center;
        border: 1px solid #333;
        flex: 1;
        position: relative;
    }

    .stat-card h4 { margin: 0 0 0.5rem 0; color: #aaa; font-size: 0.9rem; text-transform: uppercase; }
    .stat-card .level { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; }
    
    .xp-bar {
        height: 6px;
        background: #333;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        overflow: hidden;
    }
    
    .xp-fill {
        height: 100%;
        background: #2563eb;
        transition: width 0.5s ease-out;
    }

    .xp-text { font-size: 0.75rem; color: #666; }

    .action-btn {
        width: 100%;
        padding: 0 1rem;
        border: none;
        border-radius: 12px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 56px;
        gap: 0.75rem;
    }
    
    .action-btn:active:not(:disabled) { transform: scale(0.98); }
    .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .action-btn.wood { background: #2e7d32; color: white; }
    .action-btn.wood:hover:not(:disabled) { background: #1b5e20; }

    .action-btn.ore { background: #5d4037; color: white; }
    .action-btn.ore:hover:not(:disabled) { background: #3e2723; }

    .action-btn.claim { background: #0288d1; color: white; }

    .error-banner {
        background: #cf6679;
        color: black;
        padding: 1rem;
        border-radius: 12px;
        margin-bottom: 1rem;
        text-align: center;
    }

    .toast-container {
        position: fixed;
        top: 100px; /* Adjusted to not overlap header */
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        z-index: 1000;
        pointer-events: none;
        align-items: center;
    }

    .toast {
        background: #333;
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadeDown 0.3s ease-out, fadeOut 0.5s ease-in 2.5s forwards;
        white-space: nowrap;
    }

    @keyframes fadeDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    .toast.xp {
        background: #2563eb;
    }

    .toast.inventory {
        background: #e6b800;
        color: black;
        font-weight: bold;
    }

    .toast.error {
        background: #cf6679;
        color: white;
        font-weight: bold;
    }

    .loading {
        text-align: center;
        color: #888;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        flex: 1;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255,255,255,0.1);
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    .spinner-small {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255,255,255,0.1);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
