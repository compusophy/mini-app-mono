<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { sdk } from '@farcaster/miniapp-sdk';
  import { config } from '$lib/wagmi';
  import { connect, getAccount, watchAccount, getWalletClient, getPublicClient } from '@wagmi/core';
  import type { Address } from 'viem';
  import { ABIS } from '$lib/abis';
  import addresses from '$lib/addresses.json';

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
  let errorMsg: string | null = null;
  type Toast = {
    id: number;
    msg: string;
    type: 'default' | 'woodcutting-xp' | 'mining-xp' | 'inventory' | 'error';
  };
  let toasts: Toast[] = [];
  let toastIdCounter = 0;
  
  let actionLoading: string | null = null; // 'chop', 'mine', 'claim'

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
        showToast('Profile Minted!');
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
</script>

<div class="app-container">
    <header>
        <div class="header-left">
            {#if selectedProfile}
                <button class="back-btn" on:click={() => selectedProfileId = null}>
                    ← Back
                </button>
            {/if}
        </div>
        <div class="header-right">
            {#if selectedProfile}
                <button class="inventory-toggle-btn" on:click={() => showInventory = true}>
                    🎒
                </button>
            {/if}
        </div>
    </header>

    {#if showInventory && selectedProfile}
        <div class="modal-backdrop" on:click={() => showInventory = false}>
            <div class="modal-content" on:click|stopPropagation>
                <div class="modal-header">
                    <h2>Inventory</h2>
                    <button class="close-btn" on:click={() => showInventory = false}>✕</button>
                </div>
                <div class="inventory-grid">
                    {#if selectedProfile.goldBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon">💰</span>
                            <div class="item-details">
                                <span class="item-name">Gold</span>
                                <span class="item-count">x{Number(selectedProfile.goldBalance) / 1e18}</span>
                            </div>
                        </div>
                    {/if}
                    {#if selectedProfile.axeBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon">🪓</span>
                            <div class="item-details">
                                <span class="item-name">Bronze Axe</span>
                            </div>
                        </div>
                    {/if}
                    {#if selectedProfile.woodBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon">🪵</span>
                            <div class="item-details">
                                <span class="item-name">Oak Log</span>
                                <span class="item-count">x{selectedProfile.woodBalance}</span>
                            </div>
                        </div>
                    {/if}
                    {#if selectedProfile.pickaxeBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon">⛏️</span>
                            <div class="item-details">
                                <span class="item-name">Bronze Pickaxe</span>
                            </div>
                        </div>
                    {/if}
                    {#if selectedProfile.oreBalance > 0n}
                        <div class="inventory-item">
                            <span class="item-icon">🪨</span>
                            <div class="item-details">
                                <span class="item-name">Iron Ore</span>
                                <span class="item-count">x{selectedProfile.oreBalance}</span>
                            </div>
                        </div>
                    {/if}
                    
                    {#if selectedProfile.axeBalance === 0n && selectedProfile.woodBalance === 0n && selectedProfile.pickaxeBalance === 0n && selectedProfile.oreBalance === 0n && selectedProfile.goldBalance === 0n}
                        <div class="empty-state">Inventory is empty</div>
                    {/if}
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
                <p>Loading Skiller...</p>
            </div>
        {:else if !account}
            <div class="welcome">
                <h1>Welcome to Skiller</h1>
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
                <h2>Select Character</h2>
                
                <div class="profiles-grid">
                    {#each profiles as profile}
                        <button class="profile-card-btn" on:click={() => selectedProfileId = profile.id}>
                            <h3>Skiller #{profile.id}</h3>
                        </button>
                    {/each}
                </div>

                <div class="create-section">
                    <button class="mint-btn" on:click={createProfile} disabled={loading}>
                        {#if loading}
                            <div class="spinner-small"></div>
                        {:else}
                            Mint New Character
                        {/if}
                    </button>
                </div>
            </div>
        {:else}
            <!-- Gameplay Screen -->
            <div class="gameplay-screen">
                <div class="character-header">
                    <h1>Skiller #{selectedProfile.id}</h1>
                </div>

                <div class="stats-grid">
                    <div class="stat-column">
                        <div class="stat-card">
                            <h4>Woodcutting</h4>
                            <div class="level">Lvl {selectedProfile.woodcuttingLevel}</div>
                            <div class="xp-bar">
                                <div class="xp-fill" style="width: {(Number(selectedProfile.woodcuttingXp) / Number(getNextLevelXp(selectedProfile.woodcuttingLevel))) * 100}%"></div>
                            </div>
                            <div class="xp-text">{selectedProfile.woodcuttingXp} / {getNextLevelXp(selectedProfile.woodcuttingLevel)} XP</div>
                        </div>
                        
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
                                Chop Tree
                            {/if}
                        </button>
                    </div>

                    <div class="stat-column">
                        <div class="stat-card">
                            <h4>Mining</h4>
                            <div class="level">Lvl {selectedProfile.miningLevel}</div>
                            <div class="xp-bar">
                                <div class="xp-fill" style="width: {(Number(selectedProfile.miningXp) / Number(getNextLevelXp(selectedProfile.miningLevel))) * 100}%"></div>
                            </div>
                            <div class="xp-text">{selectedProfile.miningXp} / {getNextLevelXp(selectedProfile.miningLevel)} XP</div>
                        </div>

                        {#if selectedProfile.pickaxeBalance > 0n}
                            <button 
                                class="action-btn ore" 
                                disabled={!!actionLoading}
                                on:click={() => handleAction('mine', selectedProfile.id)}
                            >
                                {#if actionLoading === 'mine'}
                                    <div class="spinner-small"></div>
                                {:else}
                                    Mine Ore
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
                                    Claim Pickaxe
                                {/if}
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </main>
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
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    header {
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 40px; /* Fixed height for alignment */
    }

    .header-right {
        display: flex;
        align-items: center;
    }

    .inventory-toggle-btn {
        background: #1e1e1e;
        border: 1px solid #333;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.2rem;
        transition: all 0.2s;
    }

    .inventory-toggle-btn:hover {
        background: #2a2a2a;
        border-color: #555;
    }

    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        animation: fadeIn 0.2s ease-out;
    }

    .modal-content {
        background: #1e1e1e;
        width: 90%;
        max-width: 400px;
        border-radius: 16px;
        border: 1px solid #333;
        padding: 1.5rem;
        animation: slideUp 0.3s ease-out;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.5rem;
    }

    .close-btn {
        background: none;
        border: none;
        color: #888;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    }
    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    .inventory-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 0.75rem;
    }

    .inventory-item {
        background: #252525;
        border-radius: 12px;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.5rem;
        aspect-ratio: 1;
        justify-content: center;
    }

    .inventory-item .item-icon {
        font-size: 2rem;
    }

    .inventory-item .item-details {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .inventory-item .item-name {
        font-size: 0.75rem;
        color: #aaa;
    }

    .inventory-item .item-count {
        font-size: 0.9rem;
        font-weight: bold;
        color: white;
    }

    .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        color: #666;
        padding: 2rem;
        font-style: italic;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    .connect-btn {
        background: #333;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
    }

    main {
        padding: 1rem;
        flex: 1;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .welcome {
        text-align: center;
        margin-top: 4rem;
    }

    /* Selection Screen */
    .selection-screen {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        text-align: center;
    }

    .profiles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
    }

    .profile-card-btn {
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 2rem 1rem;
        cursor: pointer;
        transition: all 0.2s;
        color: white;
    }

    .profile-card-btn:hover {
        background: #2a2a2a;
        border-color: #555;
        transform: translateY(-2px);
    }

    .create-section {
        margin-top: 2rem;
    }

    .mint-btn {
        background: #2563eb;
        color: white;
        border: none;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        width: 100%;
        max-width: 300px;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0 auto;
    }
    .mint-btn:hover { background: #1d4ed8; }
    .mint-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Gameplay Screen */
    .gameplay-screen {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .back-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 1rem;
        padding: 0;
        display: flex;
        align-items: center;
    }
    .back-btn:hover { color: white; }

    .character-header {
        text-align: center;
        margin-bottom: 1rem;
    }

    .character-header h1 {
        margin: 0;
        font-size: 2rem;
    }

    .inventory-panel {
        background: #1e1e1e;
        padding: 1rem;
        border-radius: 12px;
        border: 1px solid #333;
        position: relative;
    }

    .inventory-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .item {
        padding: 0.75rem;
        background: #252525;
        border-radius: 8px;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .item-icon { font-size: 1.2rem; }

    .item.empty { color: #555; font-style: italic; background: none; padding-left: 0; }

    /* Stats & Actions Grid */
    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .stat-column {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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
        border-radius: 3px;
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
        padding: 1rem;
        border: none;
        border-radius: 12px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 56px;
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
        border-radius: 8px;
        margin-bottom: 1rem;
        text-align: center;
    }

    .toast-container {
        position: fixed;
        top: 20px;
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
        background: #2563eb; /* Blue for XP */
    }

    .toast.inventory {
        background: #e6b800; /* Gold/Yellow for Items */
        color: black;
        font-weight: bold;
    }

    .toast.error {
        background: #cf6679; /* Reddish */
        color: white;
        font-weight: bold;
    }

    .loading { text-align: center; color: #888; margin-top: 2rem; }

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
