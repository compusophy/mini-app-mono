<script lang="ts">
  import { onMount } from 'svelte';
  import { sdk } from '@farcaster/miniapp-sdk';
  import { config } from '$lib/wagmi';
  import { connect, getAccount, watchAccount, getWalletClient, getPublicClient } from '@wagmi/core';
  import type { Address } from 'viem';
  import { base } from 'viem/chains';
  import { ABIS } from '$lib/abis';
  import addresses from '$lib/addresses.json';

  const CONTRACT_ADDRESSES = addresses;

  let account: Address | null = null;
  let profiles: Array<{ id: bigint, image: string, tba: Address, axeBalance: bigint }> = [];
  let loading = false;

  onMount(async () => {
    try {
        await sdk.actions.ready();
    } catch (e) {
        console.error("Farcaster SDK ready error:", e);
    }

    watchAccount(config, {
        onChange(data) {
            account = data.address ?? null;
            if (account) {
                loadProfiles();
            }
        }
    });

    // Auto-connect if possible or check current status
    const currentAccount = getAccount(config);
    if (currentAccount.address) {
        account = currentAccount.address;
        await loadProfiles();
    } else {
        // Try connecting automatically if it's a mini app
        try {
            await connect(config, { connector: config.connectors[0] });
        } catch (e) {
             console.log("Auto-connect skipped", e);
        }
    }
  });

  async function connectWallet() {
      try {
        await connect(config, { connector: config.connectors[0] });
      } catch (error) {
        console.error("Error connecting wallet:", error);
      }
  }

  async function loadProfiles() {
    if (!account) return;
    
    publicClient = getPublicClient(config);
    if (!publicClient) return;

    try {
        // Assuming SkillerProfile is now Enumerable
        const balance = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SkillerProfile as Address,
          abi: ABIS.SkillerProfile,
          functionName: 'balanceOf',
          args: [account]
        });

        const loadedProfiles = [];
        
        for (let i = 0n; i < balance; i++) {
            const tokenId = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.SkillerProfile as Address,
                abi: ABIS.SkillerProfile,
                functionName: 'tokenOfOwnerByIndex',
                args: [account, i]
            });
            
            const profileData = await getProfileData(tokenId);
            loadedProfiles.push(profileData);
        }

        profiles = loadedProfiles;
    } catch (e) {
        console.error("Error loading profiles:", e);
        // Fallback for non-enumerable contract (if user hasn't redeployed yet)
        // We could try checking userToProfile just in case
    }
  }

  async function getProfileData(tokenId: bigint) {
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

    const axeBalance = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.SkillerItems as Address,
        abi: ABIS.SkillerItems,
        functionName: 'balanceOf',
        args: [tbaAddress, 101n]
    });

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
    try {
        walletClient = await getWalletClient(config);
        if (!walletClient) throw new Error("No wallet client");

        const { request } = await publicClient.simulateContract({
            account,
            address: CONTRACT_ADDRESSES.SkillerProfile as Address,
            abi: ABIS.SkillerProfile,
            functionName: 'safeMint',
            args: [account, "ipfs://new-profile"]
        });
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });

        await loadProfiles();
    } catch (e) {
        console.error(e);
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
</style>
