import { http, createConfig } from '@wagmi/core'
import { base } from '@wagmi/core/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://api.developer.coinbase.com/rpc/v1/base/78zLUgDaakNSuRxuMTNU17MSqxQoQhbd'),
  },
  connectors: [
    farcasterMiniApp()
  ]
})
