import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useStoreState, useStoreActions } from '~/store'
import { useGeb } from './useGeb'
import { formatUserVault } from '~/utils/vaults'
import { useLocation } from 'react-router-dom'

// Define the interface needed by formatUserVault
interface TokenData {
    isCollateral: boolean;
    bytes32String: string;
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    balanceE18: string;
}

// This hook is used to load vaults directly from the contract
// It's a workaround for the SDK's limitation of only checking proxy-owned safes
export function useAlternativeVaults() {
    const { address } = useAccount()
    const geb = useGeb()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const location = useLocation()
    
    const actions = useStoreActions(state => state.vaultModel)
    const {
        vaultModel: { list: currentList, liquidationData },
    } = useStoreState((state) => state)
    
    // Load vaults on every render if we're on the vaults page
    useEffect(() => {
        // Only run on the vaults page
        if (location.pathname !== '/vaults') {
            return;
        }

        // Don't try to load if we have no address or no geb
        if (!address || !geb) {
            return;
        }
        
        console.log('Loading direct vaults on vaults page for address:', address);
        setIsLoading(true);
        
        // Load direct vaults
        const loadDirectVaults = async () => {
            try {
                // Create a contract instance for direct calls
                const safeManager = new ethers.Contract(
                    geb.contracts.safeManager.address,
                    [
                        'function getSafes(address) view returns (uint256[])',
                        'function safeData(uint256) view returns (address, address, address, bytes32)'
                    ],
                    geb.provider
                )
                
                // Get safes directly owned by user
                const userSafes = await safeManager.getSafes(address)
                
                // If no user safes, done
                if (userSafes.length === 0) {
                    console.log('No direct vaults found');
                    setIsLoading(false);
                    return;
                }
                
                // Get all safeIds from the user directly owned safes
                const directSafeIds = userSafes.map((id: ethers.BigNumber) => id.toString())
                console.log('Found direct vaults:', directSafeIds);
                
                // Create instances of the contracts we need to get data
                const safeEngine = new ethers.Contract(
                    geb.contracts.safeEngine.address,
                    [
                        'function safes(bytes32,address) view returns (uint256,uint256)',
                        'function tokenCollateral(bytes32,address) view returns (uint256)',
                    ],
                    geb.provider
                )
                
                // Prepare vaults array
                const directVaults = []
                
                // Process each safe
                for (const safeId of directSafeIds) {
                    const [owner, pendingOwner, handler, collateralType] = await safeManager.safeData(safeId)
                    const [lockedCollateral, generatedDebt] = await safeEngine.safes(collateralType, handler)
                    const freeCollateral = await safeEngine.tokenCollateral(collateralType, handler)
                    
                    // Format the values
                    const formattedVault = {
                        collateral: ethers.utils.formatEther(lockedCollateral),
                        freeCollateral: ethers.utils.formatEther(freeCollateral),
                        debt: ethers.utils.formatEther(generatedDebt),
                        createdAt: new Date().toISOString(),
                        vaultHandler: handler,
                        vaultId: safeId.toString(),
                        collateralType: collateralType.toString(),
                        safeId: safeId.toString(),
                        safeHandler: handler,
                    }
                    
                    directVaults.push(formattedVault)
                }
                
                // Format vaults with price data
                if (directVaults.length > 0 && liquidationData && Object.keys(liquidationData).length > 0) {
                    // Build token data
                    const tokensData: Record<string, TokenData> = {}
                    
                    directVaults.forEach(vault => {
                        const collName = ethers.utils.parseBytes32String(vault.collateralType)
                        tokensData[collName] = {
                            isCollateral: true,
                            bytes32String: vault.collateralType,
                            symbol: collName,
                            name: collName,
                            decimals: 18,
                            address: '',
                            balance: '0',
                            balanceE18: '0'
                        }
                    })
                    
                    // Format vaults
                    const formattedVaults = formatUserVault(directVaults, liquidationData, tokensData)
                    
                    // Get existing proxy vaults (those not directly owned)
                    const proxyOwnedVaults = currentList.filter(vault => 
                        !directSafeIds.includes(vault.id)
                    )
                    
                    // Update the store with all vaults
                    actions.setList([...proxyOwnedVaults, ...formattedVaults])
                    console.log('Successfully loaded and combined vaults:', proxyOwnedVaults.length, 'proxy +', formattedVaults.length, 'direct');
                }
                
                setIsLoading(false)
            } catch (err: any) {
                console.error('Error loading direct vaults:', err)
                setError(err.message || 'Failed to load directly owned vaults')
                setIsLoading(false)
            }
        }
        
        loadDirectVaults()
        
        // Run this effect on EVERY route change to /vaults
    }, [location.pathname, address, geb, liquidationData, currentList, actions])
    
    return { isLoading, error }
} 