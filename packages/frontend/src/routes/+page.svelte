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
  let profiles: Array<{ id: bigint, image: string, tba: Address, axeBalance: bigint }> = [];
  let loading = false;
  let errorMsg: string | null = null;

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

  async function loadProfiles() {
    if (!account) {
        console.log("No account, skipping loadProfiles");
        return;
    }
    
    const publicClient = getPublicClient(config);
    if (!publicClient) {
        console.log("No public client, skipping loadProfiles");
        return;
    }

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
    try {
        axeBalance = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.SkillerItems as Address,
            abi: ABIS.SkillerItems,
            functionName: 'balanceOf',
            args: [tbaAddress, 101n]
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
        axeBalance
    };
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
            args: [account, "ipfs://new-profile"]
        });
        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        console.log("Transaction confirmed:", receipt.transactionHash);
        
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload profiles
        await loadProfiles();
        
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
    
    {#if loading}
        <p>Loading...</p>
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
                        <p>Axe Balance: {profile.axeBalance}</p>
                    </div>
                {/each}
            </div>
        {:else}
             <p>You don't have any Skiller profiles yet.</p>
        {/if}
        
        <div class="create-profile">
            <button on:click={createProfile}>Mint New Character</button>
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
  }
  .container {
    max-width: 800px;
    margin: 0 auto;
    text-align: center;
    padding: 2rem;
    font-family: sans-serif;
  }
  .profiles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
  }
  .profile-card {
    border: 1px solid #333;
    padding: 2rem;
    border-radius: 8px;
    background: #111;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .nft-image {
    width: 100%;
    max-width: 350px;
    border-radius: 8px;
    margin-bottom: 1rem;
    border: 2px solid #444;
    background: black;
  }
  code {
    background: #222;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    word-break: break-all;
    font-size: 0.9rem;
    color: #ddd;
    border: 1px solid #333;
  }
  button {
    padding: 0.8rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    background: #ff3e00;
    color: white;
    border: none;
    border-radius: 4px;
  }
  button:hover {
    background: #e63800;
  }
  .tba-address {
    margin-top: 1rem;
    font-size: 0.9rem;
  }
  .create-profile {
    margin-top: 2rem;
  }
  .error {
    color: #ff3e00;
    margin-top: 1rem;
  }
</style>