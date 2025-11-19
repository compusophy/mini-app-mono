import { http, createConfig } from '@wagmi/core'
import { base } from '@wagmi/core/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'
import { PUBLIC_RPC_URL } from '$env/static/public'

const RPC_URL = PUBLIC_RPC_URL || 'https://mainnet.base.org'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [
    farcasterMiniApp()
  ]
})
