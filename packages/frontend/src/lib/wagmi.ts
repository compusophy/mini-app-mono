import { http, createConfig } from '@wagmi/core'
import { base } from '@wagmi/core/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://base-mainnet.g.alchemy.com/v2/lAQgFlVx6Of50g3XX4YDP'),
  },
  connectors: [
    farcasterMiniApp()
  ]
})
