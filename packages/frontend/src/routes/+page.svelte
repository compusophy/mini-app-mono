<script lang="ts">
  import { onMount } from 'svelte';
  import { sdk } from '@farcaster/miniapp-sdk';
  import { config } from '$lib/wagmi';
  import { connect, getAccount, watchAccount, getWalletClient, getPublicClient } from '@wagmi/core';
  import type { Address } from 'viem';
  import { ABIS } from '$lib/abis';
  import addresses from '$lib/addresses.json';

  const CONTRACT_ADDRESSES = addresses;

  let account: Address | null = null;
  let profiles: Array<{ id: bigint, image: string, tba: Address, axeBalance: bigint, woodBalance: bigint }> = [];
  let loading = false;
  let isLoadingProfiles = false;
  let errorMsg: string | null = null;
  let choppingProfileId: bigint | null = null;

  onMount(async () => {
    try {
        await sdk.actions.ready();
    } catch (e) {
        // Not in Mini App, that's okay
        console.log("Not in Mini App environment");
    }

    watchAccount(config, {
        onChange(data) {
            account = data.address ?? null;
            if (account) {
                loadProfiles();
            }
        }
    });

    // Check if we're in a Mini App before trying to connect
    try {
        const isMiniApp = await sdk.isInMiniApp();
        
        if (isMiniApp) {
            // Auto-connect if possible
            const currentAccount = getAccount(config);
            if (currentAccount.address) {
                account = currentAccount.address;
                await loadProfiles();
            } else {
                // Try connecting automatically if it's a mini app
                try {
                    await connect(config, { connector: config.connectors[0] });
                } catch (e) {
                    // Silently fail - user can manually connect
                    console.log("Auto-connect skipped");
                }
            }
        }
    } catch (e) {
        // Not in Mini App or SDK not available
        console.log("Mini App check failed, skipping auto-connect");
    }
  });

  async function connectWallet() {
      errorMsg = null;
      try {
        // Check if we're in a Mini App first
        const isMiniApp = await sdk.isInMiniApp();
        if (!isMiniApp) {
          errorMsg = "Please open this app in a Farcaster client to connect your wallet";
          return;
        }
        
        await connect(config, { connector: config.connectors[0] });
      } catch (error: any) {
        console.error("Error connecting wallet:", error);
        errorMsg = error.message || "Failed to connect wallet. Make sure you're in a Farcaster Mini App.";
      }
  }

  async function loadProfiles(silent = false) {
    if (!account) {
        console.log("No account, skipping loadProfiles");
        return;
    }
    
    const publicClient = getPublicClient(config);
    if (!publicClient) {
        console.log("No public client, skipping loadProfiles");
        return;
    }

    if (!silent) isLoadingProfiles = true;

    try {
        console.log("Loading profiles for account:", account);
        const balance = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SkillerProfile as Address,
          abi: ABIS.SkillerProfile,
          functionName: 'balanceOf',
          args: [account]
        });

        console.log("Profile balance:", balance.toString());

        const loadedProfiles = [];
        
        for (let i = 0n; i < balance; i++) {
            const tokenId = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'tokenOfOwnerByIndex',
                args: [account, i]
            });
            
            console.log(`Loading profile #${tokenId.toString()}`);
            const profileData = await getProfileData(tokenId, publicClient);
            loadedProfiles.push(profileData);
        }

        profiles = loadedProfiles;
        console.log(`Loaded ${profiles.length} profiles`);
    } catch (e) {
        console.error("Error loading profiles:", e);
        errorMsg = `Failed to load profiles: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        if (!silent) isLoadingProfiles = false;
    }
  }

  async function getProfileData(tokenId: bigint, publicClient: any) {
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
    try {
        axeBalance = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerItems as Address,
            abi: ABIS.SkillerItems,
            functionName: 'balanceOf',
            args: [tbaAddress, 101n]
        });
        woodBalance = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerItems as Address,
            abi: ABIS.SkillerItems,
            functionName: 'balanceOf',
            args: [tbaAddress, 201n]
        });
    } catch (e) {
        console.error("Error reading items:", e);
    }

    let profileImage = null;
    try {
        const uri = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'tokenURI',
            args: [tokenId]
        });
        
        if (uri.startsWith("data:application/json;base64,")) {
            const base64Json = uri.split(",")[1];
            const jsonString = atob(base64Json);
            const metadata = JSON.parse(jsonString);
            profileImage = metadata.image;
        }
    } catch (e) {
        console.error("Error fetching metadata:", e);
    }

    return {
        id: tokenId,
        image: profileImage,
        tba: tbaAddress,
        axeBalance,
        woodBalance
    };
  }

  async function chopTree(tokenId: bigint) {
    if (!account || choppingProfileId !== null) return;
    choppingProfileId = tokenId;
    errorMsg = null;
    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        if (!walletClient || !publicClient) throw new Error("No wallet/public client");

        console.log("Chopping tree with profile:", tokenId.toString());

        // Using SkillerChopping contract
        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.SkillerChopping as Address,
            abi: ABIS.SkillerChopping,
            functionName: 'chopTree',
            args: [tokenId]
        });
        const hash = await walletClient.writeContract(request);
        console.log("Chop tx sent:", hash);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log("Chop tx confirmed:", hash);
        
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        await loadProfiles(true);
    } catch (e: any) {
        console.error("Error chopping tree:", e);
        errorMsg = e.message || "Failed to chop tree";
    } finally {
        choppingProfileId = null;
    }
  }

  async function createProfile() {
    if (!account) return;
    loading = true;
    errorMsg = null;
    try {
        const walletClient = await getWalletClient(config);
        const publicClient = getPublicClient(config);
        
        if (!walletClient || !publicClient) throw new Error("No wallet/public client");

        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'safeMint',
            args: [account]
        });
        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        console.log("Transaction confirmed:", receipt.transactionHash);
        
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload profiles
        await loadProfiles(true);
        
        console.log("Profiles loaded:", profiles.length);
    } catch (e: any) {
        console.error("Error creating profile:", e);
        errorMsg = e.message || "Failed to create profile";
    } finally {
        loading = false;
    }
  }
</script>

<main class="container">
  <h1>Skiller</h1>
  <p>The MMORPG where your profile is a wallet.</p>
  
  {#if !account}
    <button on:click={connectWallet}>Connect Wallet</button>
    {#if errorMsg}
        <p class="error">{errorMsg}</p>
    {/if}
  {:else}
    <p>Connected: {account}</p>
    
    {#if isLoadingProfiles}
        <div class="loading-interstitial">
            <div class="spinner"></div>
            <p>Loading your characters...</p>
        </div>
    {:else}
        {#if profiles.length > 0}
            <div class="profiles-grid">
                {#each profiles as profile}
                    <div class="profile-card">
                        {#if profile.image}
                            <img src={profile.image} alt="Profile NFT" class="nft-image" />
                        {:else}
                            <h2>Skiller #{profile.id}</h2>
                            <p>Loading image...</p>
                        {/if}

                        <p class="tba-address"><strong>TBA:</strong> <br/> <code>{profile.tba}</code></p>
                        <div class="inventory">
                            <p>🪓 Axes: {profile.axeBalance}</p>
                            <p>🪵 Wood: {profile.woodBalance}</p>
                        </div>
                        
                        <div class="actions">
                            <button 
                                class="secondary chopping-btn" 
                                class:active={choppingProfileId === profile.id}
                                on:click={() => chopTree(profile.id)} 
                                disabled={choppingProfileId !== null}
                            >
                                {#if choppingProfileId === profile.id}
                                    <span class="axe-anim">🪓</span> Chopping...
                                {:else}
                                    Chop Tree
                                {/if}
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
             <p>You don't have any Skiller profiles yet.</p>
        {/if}
        
        <div class="create-profile">
            <button on:click={createProfile} disabled={loading}>
                {loading ? 'Minting...' : 'Mint New Character'}
            </button>
        </div>
        {#if errorMsg}
            <p class="error">{errorMsg}</p>
        {/if}
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    background-color: #000000;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .container {
    max-width: 100%;
    margin: 0 auto;
    text-align: center;
    padding: 1rem;
    box-sizing: border-box;
  }
  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  .profiles-grid {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 2rem;
    width: 100%;
  }
  @media (min-width: 600px) {
    .profiles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }
  }
  .profile-card {
    border: 1px solid #333;
    padding: 1.5rem;
    border-radius: 12px;
    background: #111;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  }
  .nft-image {
    width: 100%;
    max-width: 280px;
    aspect-ratio: 1;
    border-radius: 8px;
    margin-bottom: 1rem;
    border: 2px solid #444;
    background: black;
    object-fit: cover;
  }
  code {
    background: #222;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    word-break: break-all;
    font-size: 0.8rem;
    color: #aaa;
    border: 1px solid #333;
    display: block;
    margin-top: 0.5rem;
  }
  button {
    padding: 0.8rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    background: #ff3e00;
    color: white;
    border: none;
    border-radius: 8px;
    width: 100%;
    max-width: 300px;
    transition: background 0.2s;
  }
  button:hover {
    background: #e63800;
  }
  button.secondary {
    background: #333;
    margin-top: 1rem;
  }
  button.secondary:hover {
    background: #444;
  }
  .tba-address {
    margin-top: 1rem;
    font-size: 0.9rem;
    width: 100%;
  }
  .create-profile {
    margin-top: 2rem;
    margin-bottom: 4rem;
  }
  .error {
    color: #ff3e00;
    margin-top: 1rem;
    background: rgba(255, 62, 0, 0.1);
    padding: 1rem;
    border-radius: 8px;
  }
  .loading-interstitial {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 0;
    color: #888;
  }
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #333;
    border-top: 4px solid #ff3e00;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes chop {
    0% { transform: rotate(0deg); }
    50% { transform: rotate(-45deg); }
    100% { transform: rotate(0deg); }
  }
  .axe-anim {
    display: inline-block;
    animation: chop 0.4s ease-in-out infinite;
    margin-right: 0.5rem;
    transform-origin: bottom left;
  }
  .chopping-btn.active {
    background: #555;
    cursor: not-allowed;
    border-color: #666;
    color: #ddd;
  }
</style>