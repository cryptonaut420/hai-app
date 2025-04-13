import { useMemo } from 'react'
import { providers } from 'ethers'
import { createPublicClient, http } from 'viem'
import { optimism, optimismSepolia } from 'viem/chains'
import { useWalletClient, usePublicClient } from 'wagmi'

import { NETWORK_ID, VITE_MAINNET_PUBLIC_RPC, VITE_TESTNET_PUBLIC_RPC, ChainId } from '~/utils'

// Creates a provider with disabled ENS lookup to avoid errors
function createProviderWithDisabledENS(url: string) {
    const provider = new providers.JsonRpcProvider(url)
    
    // Override ENS methods to do nothing, preventing ENS resolution attempts
    provider.resolveName = async (name: string) => {
        console.log('[Provider] ENS resolution disabled, returning name as is:', name)
        return name
    }
    
    provider.lookupAddress = async (address: string) => {
        return ''
    }
    
    // Force provider connection to ensure it's ready
    provider.getNetwork().catch(err => {
        console.error('[Provider Error]', err)
    })
    
    return provider
}

// Public provider, optimized for mainnet to avoid ENS issues
export function usePublicProvider() {
    const publicClient = usePublicClient()
    
    return useMemo(() => {
        // For mainnet, use Alchemy URL directly to avoid ENS resolution issues
        if (NETWORK_ID === ChainId.MAINNET) {
            return createProviderWithDisabledENS(VITE_MAINNET_PUBLIC_RPC)
        } else if (NETWORK_ID === ChainId.OPTIMISM_SEPOLIA) {
            return createProviderWithDisabledENS(VITE_TESTNET_PUBLIC_RPC)
        }
        
        // Create a custom client for the current network
        const customClient = createPublicClient({
            chain: NETWORK_ID === ChainId.MAINNET ? optimism : optimismSepolia,
            transport: http(
                NETWORK_ID === ChainId.MAINNET 
                    ? VITE_MAINNET_PUBLIC_RPC 
                    : VITE_TESTNET_PUBLIC_RPC
            )
        })
        
        // Convert to ethers provider with disabled ENS
        const provider = new providers.JsonRpcProvider(
            customClient.transport.url, 
            { 
                chainId: customClient.chain.id,
                name: customClient.chain.name 
            }
        )
        
        // Override ENS methods
        provider.resolveName = async (name: string) => name
        provider.lookupAddress = async () => ''
        
        return provider
    }, [publicClient])
}

// For backward compatibility with your existing code
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
    return usePublicProvider()
}

// Ethers signer - converts viem wallet client to ethers signer
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
    const { data: walletClient } = useWalletClient({ chainId })
    
    return useMemo(() => {
        if (!walletClient) return undefined
        
        const { account, chain, transport } = walletClient
        const network = {
            chainId: chain.id,
            name: chain.name,
            ensAddress: chain.contracts?.ensRegistry?.address,
        }
        
        const provider = new providers.Web3Provider(transport, network)
        
        // Disable ENS resolution
        provider.resolveName = async (name: string) => name
        provider.lookupAddress = async () => ''
        
        return provider.getSigner(account.address)
    }, [walletClient])
} 