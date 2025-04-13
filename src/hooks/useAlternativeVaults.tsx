import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useStoreState, useStoreActions } from '~/store'
import { useGeb } from './useGeb'

// This hook is used to load vaults directly from the contract
// It's a workaround for the SDK's limitation of only checking proxy-owned safes
export function useAlternativeVaults() {
    const { address } = useAccount()
    const geb = useGeb() // This returns the Geb instance directly, not an object with a geb property
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const hasLoaded = useRef(false)
    
    const actions = useStoreActions(state => state.vaultModel)
    const {
        vaultModel: { list: currentList },
    } = useStoreState((state) => state)
    
    // Load vaults directly
    useEffect(() => {
        // Make sure geb is defined before proceeding
        if (!address || !geb || hasLoaded.current) {
            return
        }
        
        const loadDirectVaults = async () => {
            try {
                setIsLoading(true)
                
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
                
                // If no user safes, don't continue
                if (userSafes.length === 0) {
                    setIsLoading(false)
                    hasLoaded.current = true
                    return
                }
                
                // Check if these safes are already in the list
                const currentIds = currentList.map(v => v.id)
                const newSafeIds = userSafes.map((id: ethers.BigNumber) => id.toString()).filter((id: string) => !currentIds.includes(id))
                
                if (newSafeIds.length === 0) {
                    setIsLoading(false)
                    hasLoaded.current = true
                    return
                }
                
                // Get safe details and format them
                const directVaults = []
                for (const safeId of newSafeIds) {
                    // Get the safe's data
                    const [owner, pendingOwner, handler, collateralType] = await safeManager.safeData(safeId)
                    
                    // Create a safe engine interface
                    const safeEngine = new ethers.Contract(
                        geb.contracts.safeEngine.address,
                        [
                            'function safes(bytes32,address) view returns (uint256,uint256)',
                            'function tokenCollateral(bytes32,address) view returns (uint256)'
                        ],
                        geb.provider
                    )
                    
                    // Get collateral and debt amounts
                    const [lockedCollateral, generatedDebt] = await safeEngine.safes(collateralType, handler)
                    const freeCollateral = await safeEngine.tokenCollateral(collateralType, handler)
                    
                    // Convert collateral type to string
                    const collateralName = ethers.utils.parseBytes32String(collateralType)
                    
                    // Create vault object
                    const vault = {
                        id: safeId.toString(),
                        vaultHandler: handler,
                        date: new Date().toISOString(),
                        riskState: 2, // Default risk state
                        collateral: ethers.utils.formatEther(lockedCollateral),
                        debt: ethers.utils.formatEther(generatedDebt),
                        totalDebt: ethers.utils.formatEther(generatedDebt),
                        availableDebt: '0',
                        accumulatedRate: '1',
                        collateralRatio: '150', // Default value
                        freeCollateral: ethers.utils.formatEther(freeCollateral),
                        currentRedemptionPrice: '1',
                        currentLiquidationPrice: '0',
                        internalCollateralBalance: '0',
                        liquidationCRatio: '1.5',
                        liquidationPenalty: '1',
                        liquidationPrice: '0',
                        totalAnnualizedStabilityFee: '0',
                        currentRedemptionRate: '0',
                        collateralType: collateralType.toString(),
                        collateralName
                    }
                    
                    directVaults.push(vault)
                }
                
                // Add found vaults to the store
                if (directVaults.length > 0) {
                    actions.setList([...currentList, ...directVaults])
                }
                
                hasLoaded.current = true
                setIsLoading(false)
            } catch (err: any) {
                console.error('Error loading direct vaults:', err)
                setError(err.message || 'Failed to load directly owned vaults')
                hasLoaded.current = true
                setIsLoading(false)
            }
        }
        
        loadDirectVaults()
    }, [address, geb])
    
    return { isLoading, error }
} 