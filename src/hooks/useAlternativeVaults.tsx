import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useStoreState, useStoreActions } from '~/store'
import { useGeb } from './useGeb'
import { getLiquidationPrice, ratioChecker, riskStateToStatus } from '~/utils/vaults'

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
                            'function tokenCollateral(bytes32,address) view returns (uint256)',
                            'function cData(bytes32) view returns (uint256,uint256,uint256,uint256)',
                            'function cParams(bytes32) view returns (uint256,uint256)'
                        ],
                        geb.provider
                    )
                    
                    // Create oracle relayer interface
                    const oracleRelayer = new ethers.Contract(
                        geb.contracts.oracleRelayer.address,
                        [
                            'function redemptionPrice() view returns (uint256)',
                            'function cParams(bytes32) view returns (uint256,uint256)'
                        ],
                        geb.provider
                    )
                    
                    // Create tax collector interface
                    const taxCollector = new ethers.Contract(
                        geb.contracts.taxCollector.address,
                        [
                            'function cData(bytes32) view returns (uint256)'
                        ],
                        geb.provider
                    )
                    
                    // Get collateral and debt amounts
                    const [lockedCollateral, generatedDebt] = await safeEngine.safes(collateralType, handler)
                    const freeCollateral = await safeEngine.tokenCollateral(collateralType, handler)
                    
                    // Get collateral type data
                    const [accumulatedRate, safetyPrice, liquidationPrice, debtAmount] = await safeEngine.cData(collateralType)
                    
                    // Get oracle relayer params
                    const [safetyCRatio, liquidationCRatio] = await oracleRelayer.cParams(collateralType)
                    
                    // Get redemption price
                    const redemptionPrice = await oracleRelayer.redemptionPrice()
                    
                    // Get stability fee
                    const stabilityFee = await taxCollector.cData(collateralType)
                    
                    // Convert collateral type to string
                    const collateralName = ethers.utils.parseBytes32String(collateralType)
                    
                    // Format values
                    const formattedCollateral = ethers.utils.formatEther(lockedCollateral)
                    const formattedDebt = ethers.utils.formatEther(generatedDebt)
                    const formattedFreeCollateral = ethers.utils.formatEther(freeCollateral)
                    const formattedAccumulatedRate = ethers.utils.formatUnits(accumulatedRate, 27)
                    const formattedSafetyCRatio = ethers.utils.formatUnits(safetyCRatio, 27)
                    const formattedLiquidationCRatio = ethers.utils.formatUnits(liquidationCRatio, 27)
                    const formattedRedemptionPrice = ethers.utils.formatUnits(redemptionPrice, 27)
                    
                    // Calculate annual stability fee (similar to InfoCommand.js)
                    const formattedStabilityFee = ethers.utils.formatUnits(stabilityFee, 27)
                    const stabilityFeeNumber = parseFloat(formattedStabilityFee)
                    
                    // Use the same approach as the protocol does (annual compounding)
                    // For a 2% fee, the stabilityFee would be 1.02 in RAY precision
                    const annualizedStabilityFee = Math.pow(stabilityFeeNumber, 3600 * 24 * 365).toString()
                    
                    // Calculate liquidation price
                    const calculatedLiquidationPrice = getLiquidationPrice(
                        formattedCollateral,
                        formattedDebt,
                        formattedLiquidationCRatio,
                        formattedRedemptionPrice
                    )
                    
                    // Calculate collateralization ratio
                    let collateralRatio = '0'
                    if (Number(formattedDebt) === 0) {
                        collateralRatio = 'Infinity'
                    } else {
                        const collateralValue = Number(formattedCollateral) * parseFloat(ethers.utils.formatUnits(liquidationPrice, 27))
                        const debtValue = Number(formattedDebt) * parseFloat(formattedAccumulatedRate)
                        if (debtValue > 0) {
                            collateralRatio = ((collateralValue / debtValue) * 100).toString()
                        }
                    }
                    
                    // Determine risk state
                    const riskState = ratioChecker(
                        Number(collateralRatio) === Infinity ? Infinity : Number(collateralRatio), 
                        Number(formattedSafetyCRatio) * 100
                    )
                    const status = riskStateToStatus[riskState]
                    
                    // Create vault object
                    const vault = {
                        id: safeId.toString(),
                        vaultHandler: handler,
                        date: new Date().toISOString(),
                        riskState,
                        status,
                        collateral: formattedCollateral,
                        debt: formattedDebt,
                        totalDebt: formattedDebt,
                        availableDebt: '0', // Calculate this if needed
                        accumulatedRate: formattedAccumulatedRate,
                        collateralRatio,
                        freeCollateral: formattedFreeCollateral,
                        currentRedemptionPrice: formattedRedemptionPrice,
                        currentLiquidationPrice: ethers.utils.formatUnits(liquidationPrice, 27),
                        internalCollateralBalance: ethers.utils.formatEther(freeCollateral),
                        liquidationCRatio: formattedLiquidationCRatio,
                        liquidationPenalty: '1.1', // Default, can fetch from liquidation engine if needed
                        liquidationPrice: calculatedLiquidationPrice,
                        totalAnnualizedStabilityFee: annualizedStabilityFee,
                        currentRedemptionRate: '1', // Default, can fetch if needed
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
    }, [address, geb, liquidationData])
    
    return { isLoading, error }
} 