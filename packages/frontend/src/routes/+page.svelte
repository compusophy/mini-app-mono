<script lang="ts">
	import { createPublicClient, createWalletClient, custom, http } from 'viem';
	import { base } from 'viem/chains';
	import { contractABI, contractAddress } from '$lib/contract';

	let greeting = $state('Loading...');
	let newGreeting = $state('');
	let account = $state<string | null>(null);
	let isConnected = $state(false);
    let status = $state('');
    let txHash = $state<string | null>(null);

	async function switchToBaseMainnet() {
		if (!window.ethereum) return false;
		
		try {
			await window.ethereum.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: '0x2105' }], // Base Mainnet chain ID in hex
			});
			return true;
		} catch (switchError: any) {
			// This error code indicates that the chain has not been added to MetaMask
			if (switchError.code === 4902) {
				try {
					await window.ethereum.request({
						method: 'wallet_addEthereumChain',
						params: [{
							chainId: '0x2105',
							chainName: 'Base',
							nativeCurrency: {
								name: 'ETH',
								symbol: 'ETH',
								decimals: 18
							},
							rpcUrls: ['https://mainnet.base.org'],
							blockExplorerUrls: ['https://basescan.org']
						}],
					});
					return true;
				} catch (addError) {
					console.error('Failed to add Base network:', addError);
					return false;
				}
			}
			console.error('Failed to switch network:', switchError);
			return false;
		}
	}

	async function connectWallet() {
		if (!window.ethereum) {
			status = 'No wallet found. Please install MetaMask or similar.';
			return;
		}

		try {
			// Switch to Base Mainnet first
			status = 'Switching to Base Mainnet...';
			const switched = await switchToBaseMainnet();
			if (!switched) {
				status = 'Please switch to Base Mainnet manually in your wallet.';
				return;
			}

			const walletClient = createWalletClient({
				chain: base,
				transport: custom(window.ethereum)
			});

			const [address] = await walletClient.requestAddresses();
			account = address;
			isConnected = true;
            status = 'Connected to Base Mainnet';
            await fetchGreeting();
		} catch (error) {
			console.error(error);
			status = 'Failed to connect wallet.';
		}
	}

	async function fetchGreeting() {
		if (!account) return;

		const publicClient = createPublicClient({
			chain: base,
			transport: http('https://mainnet.base.org') // Use Base Mainnet RPC
		});

		try {
			const data = await publicClient.readContract({
				address: contractAddress,
				abi: contractABI,
				functionName: 'greet'
			});
			greeting = data as string;
		} catch (e: any) {
            console.error('Fetch error:', e);
			greeting = `Error: ${e?.message || 'Failed to fetch greeting'}`;
		}
	}

	async function updateGreeting() {
		if (!account || !newGreeting) return;
        status = 'Updating...';

		try {
			// Check and switch network if needed
			const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
			if (currentChainId !== '0x2105') { // Base Mainnet
				status = 'Switching to Base Mainnet...';
				const switched = await switchToBaseMainnet();
				if (!switched) {
					status = 'Please switch to Base Mainnet to continue.';
					return;
				}
			}

			const walletClient = createWalletClient({
				chain: base,
				transport: custom(window.ethereum)
			});

			const publicClient = createPublicClient({
				chain: base,
				transport: custom(window.ethereum)
			});

			const hash = await walletClient.writeContract({
				address: contractAddress,
				abi: contractABI,
				functionName: 'setGreeting',
				args: [newGreeting],
				account: account as `0x${string}`
			});
            
            status = `Transaction sent! Waiting for confirmation...`;
            
            // Wait for transaction receipt
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            
            if (receipt.status === 'success') {
                newGreeting = ''; // Clear input
                txHash = hash; // Store hash for link
                await fetchGreeting(); // Refresh greeting automatically
                status = 'Success! Transaction confirmed.';
            } else {
                status = `Transaction failed: ${hash}`;
                txHash = null;
            }
		} catch (error: any) {
			console.error('Update error:', error);
			txHash = null; // Clear hash on error
			let errorMsg = 'Error updating greeting';
			if (error?.message) {
				if (error.message.includes('chain')) {
					errorMsg = 'Please switch to Base Mainnet in your wallet.';
				} else {
					errorMsg += `: ${error.message}`;
				}
			} else if (typeof error === 'string') {
				errorMsg += `: ${error}`;
			}
			status = errorMsg;
		}
	}
    
    $effect(() => {
        // Auto connect if already permitted?
        // For now, manual connect.
    });

</script>

<main>
	<h1>Greeter DApp</h1>

	{#if !isConnected}
		<div class="card">
			<button onclick={connectWallet}>Connect Wallet</button>
		</div>
	{:else}
		<div class="card">
			<p class="status">Connected: <span class="address">{account}</span></p>
		</div>
		
		<div class="card">
			<h2>Current Greeting</h2>
			<p class="greeting">{greeting}</p>
            <button class="secondary" onclick={fetchGreeting}>Refresh</button>
		</div>

		<div class="card">
			<h2>Update Greeting</h2>
            <div class="input-group">
			    <input bind:value={newGreeting} placeholder="New greeting" />
			    <button onclick={updateGreeting}>Set Greeting</button>
            </div>
		</div>
	{/if}
    
    {#if status}
        <p class="status-message">
            {status}
            {#if txHash}
                <a href="https://basescan.org/tx/{txHash}" target="_blank" rel="noopener noreferrer" class="tx-link">
                    {txHash.substring(0, 6)}...{txHash.substring(txHash.length - 4)}
                </a>
            {/if}
        </p>
    {/if}
</main>

<style>
    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f5f5f7;
        color: #333;
        display: flex;
        justify-content: center;
        min-height: 100vh;
    }

    main {
        max-width: 600px;
        width: 100%;
        margin: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    h1 {
        text-align: center;
        color: #1a1a1a;
        font-weight: 700;
        margin-bottom: 1rem;
    }

    h2 {
        margin-top: 0;
        font-size: 1.2rem;
        color: #666;
        font-weight: 600;
    }

    .card {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        transition: transform 0.2s ease;
    }

    .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0,0,0,0.08);
    }

    button {
        background-color: #0052ff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1rem;
    }

    button:hover {
        background-color: #0040cc;
    }

    button.secondary {
        background-color: #f0f2f5;
        color: #333;
    }

    button.secondary:hover {
        background-color: #e4e6eb;
    }

    input {
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 1rem;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.2s;
    }

    input:focus {
        outline: none;
        border-color: #0052ff;
    }

    .input-group {
        display: flex;
        gap: 0.5rem;
    }
    
    .input-group input {
        flex: 1;
    }

    .greeting {
        font-size: 2rem;
        font-weight: 800;
        margin: 1rem 0;
        color: #1a1a1a;
        word-break: break-word;
    }

    .address {
        font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace;
        background: #f0f2f5;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.9rem;
    }

    .status {
        margin: 0;
        color: #666;
    }

    .status-message {
        text-align: center;
        color: #0052ff;
        font-weight: 500;
        margin-top: 1rem;
        background: #e6f0ff;
        padding: 0.75rem;
        border-radius: 8px;
    }

    .tx-link {
        color: #0052ff;
        text-decoration: underline;
        margin-left: 0.5rem;
        font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace;
    }

    .tx-link:hover {
        color: #0040cc;
    }
</style>

