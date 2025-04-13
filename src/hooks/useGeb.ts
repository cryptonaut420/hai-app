import { useCallback, useEffect, useMemo, useState } from 'react'
import { Geb } from '@parisii-inc/parys-sdk'
import { useAccount } from 'wagmi'

import { EMPTY_ADDRESS, getNetworkName, formatNumber, NETWORK_ID } from '~/utils'
import { useStoreActions, useStoreState } from '~/store'
import { useEthersSigner, usePublicProvider } from './useEthersAdapters'

type TokenType = 'ETH' | 'PARYS' | 'WETH'

// Geb with signer
export function useGeb() {
    const [state, setState] = useState<any>()
    const signer = useEthersSigner()
    useEffect(() => {
        if (!signer) return
        const networkName = getNetworkName(NETWORK_ID)
        const geb = new Geb(networkName, signer)
        setState(geb)
    }, [signer])

    return state
}

// Geb with public provider, no need to connect wallet
export function usePublicGeb() {
    const provider = usePublicProvider()
    const publicGeb = useMemo(() => {
        try {
            console.log('[DEBUG] Network ID:', NETWORK_ID)
            const networkName = getNetworkName(NETWORK_ID)
            console.log('[DEBUG] Network name:', networkName)
            
            // Force ethers provider to connect to network before initializing Geb
            // This prevents race conditions with ENS resolution attempts
            return new Geb(networkName, provider)
        } catch (error) {
            console.error('[SDK ERROR] Failed to initialize Geb:', error)
            // Return a minimal Geb instance to prevent app from crashing
            const networkName = getNetworkName(NETWORK_ID)
            return new Geb(networkName, provider)
        }
    }, [provider])
    return publicGeb
}

// check if is owner of the vault
export function useIsOwner(vaultId: string): boolean {
    const [state, setState] = useState(true)
    const geb = useGeb()
    const { address: account } = useAccount()

    const getIsOwnerCallback = useCallback((res) => {
        if (res) {
            const [proxyAddress, { owner }] = res
            if (proxyAddress && owner) {
                setState(proxyAddress === owner)
            }
        }
    }, [])

    useEffect(() => {
        if (!geb || !account || !vaultId) return undefined
        setState(true)
        Promise.all([
            geb.contracts.proxyFactory.proxies(account as string),
            geb.contracts.safeManager.safeData(vaultId),
        ])
            .then(getIsOwnerCallback)
            .catch((error) => console.error(`Failed to get proxyAddress and VaultOwner`, error))
    }, [account, geb, getIsOwnerCallback, vaultId])

    return state
}

// Returns proxy address from @hai-on-op/sdk
export function useProxyAddress() {
    const geb = useGeb()
    const { address: account } = useAccount()
    const { connectWalletModel: connectWalletState } = useStoreState((state) => state)
    const { connectWalletModel: connectWalletActions } = useStoreActions((state) => state)
    const { proxyAddress } = connectWalletState

    useEffect(() => {
        if (!geb || !account || proxyAddress) return
        async function getProxyAddress() {
            try {
                const userProxy = await geb.getProxyAction(account as string)
                if (userProxy && userProxy.proxyAddress && userProxy.proxyAddress !== EMPTY_ADDRESS) {
                    connectWalletActions.setProxyAddress(userProxy.proxyAddress)
                }
            } catch (error) {
                console.log(error)
            }
        }
        getProxyAddress()
    }, [account, connectWalletActions, geb, proxyAddress])

    return useMemo(() => proxyAddress, [proxyAddress])
}

// returns amount of currency in USD
export function useTokenBalanceInUSD(token: TokenType, balance: string) {
    const { connectWalletModel, vaultModel } = useStoreState((state) => state)
    const ethPrice = connectWalletModel.fiatPrice
    const haiPrice = vaultModel.liquidationData?.currentRedemptionPrice

    return useMemo(() => {
        const price = token === 'ETH' || token === 'WETH' ? ethPrice : haiPrice
        if (!balance) return '0'
        return formatNumber((Number(price) * Number(balance)).toString(), 2)
    }, [token, ethPrice, haiPrice, balance])
}
