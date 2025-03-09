import { configureChains, createConfig } from 'wagmi'
import { optimism, optimismGoerli, optimismSepolia, mainnet } from 'wagmi/chains'
import { alchemyProvider } from 'wagmi/providers/alchemy'
import { publicProvider } from 'wagmi/providers/public'
import { jsonRpcProvider } from 'wagmi/providers/jsonRpc'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import { injectedWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'

import { NETWORK_ID, VITE_ALCHEMY_KEY, VITE_WALLETCONNECT_ID, ChainId } from './constants'

const projectId = VITE_WALLETCONNECT_ID!

// Define local development chain (Anvil)
const localChain = {
    id: ChainId.LOCAL,
    name: 'Local Anvil',
    network: 'anvil',
    nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
    },
    rpcUrls: {
        default: { http: ['http://localhost:8545'] },
        public: { http: ['http://localhost:8545'] }
    }
}

// Choose the right chain based on network ID
const getChain = () => {
    switch (NETWORK_ID) {
        case ChainId.MAINNET:
            return optimism
        case ChainId.OPTIMISM_GOERLI:
            return optimismGoerli
        case ChainId.OPTIMISM_SEPOLIA:
            return optimismSepolia
        case ChainId.LOCAL:
            return localChain
        default:
            return optimismSepolia
    }
}

// Include all possible chains in the configureChains call
// This ensures RainbowKit knows about all supported chains
const { chains, publicClient } = configureChains(
    // Add all supported chains here, including localChain
    [optimism, optimismGoerli, optimismSepolia, localChain],
    [
        alchemyProvider({ apiKey: VITE_ALCHEMY_KEY! }),
        jsonRpcProvider({
            rpc: (chain) => {
                if (chain.id === ChainId.LOCAL) {
                    return { http: 'http://localhost:8545' }
                }
                return null
            }
        }),
        publicProvider()
    ]
)

const connectors = connectorsForWallets([
    {
        groupName: 'Recommended',
        wallets: [
            injectedWallet({ chains }),
            rainbowWallet({ projectId, chains }),
            walletConnectWallet({ projectId, chains }),
        ],
    },
])

const wagmiConfig = createConfig({
    autoConnect: true,
    connectors,
    publicClient,
})

export { wagmiConfig, chains }
