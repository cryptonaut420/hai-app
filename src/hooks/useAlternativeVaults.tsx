import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useStoreState, useStoreActions } from '~/store'
import { useGeb } from './useGeb'
import { 
    getLiquidationPrice, 
    getCollateralRatio, 
    ratioChecker, 
    riskStateToStatus, 
    returnAvaiableDebt,
    formatUserVault
} from '~/utils/vaults'

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
    const geb = useGeb() // This returns the Geb instance directly, not an object with a geb property
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const hasLoaded = useRef(false)
    
    const actions = useStoreActions(state => state.vaultModel)
    const {
        vaultModel: { list: currentList, liquidationData },
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
                
                // Create instances of the contracts we need to get data
                const safeEngine = new ethers.Contract(
                    geb.contracts.safeEngine.address,
                    [
                        'function safes(bytes32,address) view returns (uint256,uint256)',
                        'function tokenCollateral(bytes32,address) view returns (uint256)',
                        'function cData(bytes32) view returns (uint256,uint256,uint256,uint256)',
                        'function cParams(bytes32) view returns (uint256,uint256)'
                    ],
                    geb.provider
                )
                
                const oracleRelayer = new ethers.Contract(
                    geb.contracts.oracleRelayer.address,
                    [
                        'function redemptionPrice() view returns (uint256)',
                        'function redemptionRate() view returns (uint256)',
                        'function cParams(bytes32) view returns (uint256,uint256)'
                    ],
                    geb.provider
                )
                
                const taxCollector = new ethers.Contract(
                    geb.contracts.taxCollector.address,
                    [
                        'function cData(bytes32) view returns (uint256)'
                    ],
                    geb.provider
                )
                
                // Prepare vaults array to match the same format expected by formatUserVault
                const directVaults = []
                
                // Process each safe to format it properly for formatUserVault
                for (const safeId of newSafeIds) {
                    const [owner, pendingOwner, handler, collateralType] = await safeManager.safeData(safeId)
                    const [lockedCollateral, generatedDebt] = await safeEngine.safes(collateralType, handler)
                    const freeCollateral = await safeEngine.tokenCollateral(collateralType, handler)
                    
                    // Format the values exactly as expected by formatUserVault
                    const collateralName = ethers.utils.parseBytes32String(collateralType)
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
                
                // Now use the formatUserVault function to match the exact format used elsewhere
                // This ensures all calculations are done consistently
                if (directVaults.length > 0 && liquidationData && Object.keys(liquidationData).length > 0) {
                    // Get the tokensData structure (required by formatUserVault)
                    const tokensData: Record<string, TokenData> = {}
                    
                    // Populate tokensData with the necessary structure for each vault
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
                    
                    // Use the exact same formatUserVault function that works elsewhere
                    const formattedVaults = formatUserVault(directVaults, liquidationData, tokensData)
                    
                    // Add the formatted vaults to the store
                    actions.setList([...currentList, ...formattedVaults])
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
    }, [address, geb, liquidationData])
    
    return { isLoading, error }
} 