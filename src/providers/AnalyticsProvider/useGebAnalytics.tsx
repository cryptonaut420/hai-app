import { useEffect, useReducer, useState } from 'react'
import { formatEther } from 'ethers/lib/utils'
import { Geb } from '@parisii-inc/parys-sdk'
import { useNetwork } from 'wagmi'
import { ethers } from 'ethers'

import type { SummaryItemValue, TokenAnalyticsData } from '~/types'
import {
    DEPRECATED_COLLATERALS,
    formatSummaryValue,
    transformToAnnualRate,
    transformToEightHourlyRate,
    transformToWadPercentage,
    formatNumberWithStyle,
} from '~/utils'
import { usePublicGeb } from '~/hooks'
import { useStoreState } from '~/store'

export type GebAnalyticsData = {
    erc20Supply: SummaryItemValue
    globalDebt: SummaryItemValue
    globalDebtUtilization: string
    globalDebtCeiling: SummaryItemValue
    surplusInTreasury: SummaryItemValue
    marketPrice: SummaryItemValue
    redemptionPrice: SummaryItemValue
    priceDiff: number
    annualRate: SummaryItemValue
    eightRate: SummaryItemValue
    pRate: SummaryItemValue
    iRate: SummaryItemValue
    tokenAnalyticsData: TokenAnalyticsData[]
}

async function fetchAnalyticsDataDirect(geb: any) {
    //console.log('[Analytics] Manual data fetching...')
    
    try {
        // Check if contracts are available
        if (!geb.contracts || !geb.contracts.safeEngine) {
            console.error('[Analytics] Contracts not initialized properly')
            throw new Error('Contracts not initialized properly')
        }
        
        // Log available contracts
        //console.log('[Analytics] Available contracts:', Object.keys(geb.contracts))
        
        // Initialize result with default values
        const result: GebAnalyticsData = { ...DEFAULT_ANALYTICS_DATA }
        
        // Create a helper function for safe contract calls with detailed logging
        const safeCall = async (contractName: string, methodName: string, ...args: any[]) => {
            try {
                if (!geb.contracts[contractName]) {
                    //console.warn(`[Analytics] Contract ${contractName} not available`)
                    return null
                }
                
                //console.log(`[Analytics] Calling ${contractName}.${methodName}(${args.join(', ')})...`)
                
                if (typeof geb.contracts[contractName][methodName] !== 'function') {
                    //console.warn(`[Analytics] Method ${methodName} not found on contract ${contractName}`)
                    return null
                }
                
                // Use callStatic for read operations to avoid requiring a signer
                const contract = geb.contracts[contractName];
                const hasCallStatic = contract.callStatic && typeof contract.callStatic[methodName] === 'function';
                
                let response;
                if (hasCallStatic) {
                    response = await contract.callStatic[methodName](...args);
                } else {
                    // Fallback to normal call which may fail if it's not a view function
                    response = await contract[methodName](...args);
                }
                
                //console.log(`[Analytics] ${contractName}.${methodName} response:`, response)
                return response
            } catch (error) {
                console.error(`[Analytics] Error calling ${contractName}.${methodName}():`, error)
                return null
            }
        }
        
        try {
            // Get global debt from SafeEngine
            const globalDebt = await safeCall('safeEngine', 'globalDebt')
            if (globalDebt) {
                // For extremely large numbers, we need to be careful with formatting
                const formattedGlobalDebt = formatEther(globalDebt)
                //console.log('[Analytics] Raw globalDebt:', globalDebt.toString(), 'formatted to:', formattedGlobalDebt)
                
                try {
                    // Parse the formatted number
                    const normalizedDebt = parseFloat(formattedGlobalDebt);
                    
                    // Attempt to extract the actual debt by dividing by 10^27 (common scaling factor)
                    // This is because the debt is stored with additional decimal precision
                    const scaleFactor = 1e27;
                    const scaledDebt = normalizedDebt / scaleFactor;
                    
                    //console.log('[Analytics] Normalizing debt:', normalizedDebt, 'scaled to:', scaledDebt);
                    
                    // Convert to a more readable number (billions or trillions as needed)
                    result.globalDebt = {
                        raw: scaledDebt.toString(),
                        formatted: scaledDebt > 1e12 
                            ? `€${(scaledDebt / 1e12).toFixed(2)}T` 
                            : scaledDebt > 1e9 
                                ? `€${(scaledDebt / 1e9).toFixed(2)}B` 
                                : scaledDebt > 1e6 
                                    ? `€${(scaledDebt / 1e6).toFixed(2)}M` 
                                    : formatNumberWithStyle(scaledDebt, { 
                                        maxDecimals: 2, 
                                        style: 'currency' 
                                    })
                    }
                    //console.log('[Analytics] Final globalDebt value:', result.globalDebt);
                } catch (error) {
                    //console.warn('[Analytics]Error formatting global debt:', error);
                    // Fallback in case of error
                    result.globalDebt = {
                        raw: formattedGlobalDebt,
                        formatted: formatNumberWithStyle(formattedGlobalDebt, { maxDecimals: 2 })
                    }
                }
            }
            
            // Get global debt ceiling from SafeEngine params
            const params = await safeCall('safeEngine', '_params')
            if (params && params.length >= 2) {
                const globalDebtCeiling = params[1] // Second parameter is globalDebtCeiling
                const formattedGlobalDebtCeiling = formatEther(globalDebtCeiling)
                result.globalDebtCeiling = {
                    raw: formattedGlobalDebtCeiling,
                    formatted: formatNumberWithStyle(formattedGlobalDebtCeiling, { 
                        maxDecimals: 0, 
                        style: 'currency' 
                    })
                }
                //console.log('[Analytics] Successfully fetched globalDebtCeiling:', formattedGlobalDebtCeiling)
                
                // Calculate debt utilization
                if (globalDebt && globalDebtCeiling.gt(0)) {
                    const utilizationRaw = globalDebt.mul(100).div(globalDebtCeiling).toString()
                    result.globalDebtUtilization = `${utilizationRaw}%`
                }
            }
            
            // Get ERC20 supply
            let coinAddress = null;
            try {
                coinAddress = await safeCall('oracleRelayer', 'coin')
            } catch (error) {
                // Fallback to known token address if available
                if (geb.contracts.systemCoin && geb.contracts.systemCoin.address) {
                    coinAddress = geb.contracts.systemCoin.address
                }
            }
            
            if (coinAddress && (geb.contracts.coin || geb.contracts.systemCoin)) {
                const coinContract = geb.contracts.coin || geb.contracts.systemCoin
                const totalSupply = await safeCall('systemCoin', 'totalSupply')
                if (totalSupply) {
                    const formattedSupply = formatEther(totalSupply)
                    result.erc20Supply = {
                        raw: formattedSupply,
                        formatted: formatNumberWithStyle(formattedSupply, { maxDecimals: 0 })
                    }
                    //console.log('[Analytics] Successfully fetched ERC20 supply:', formattedSupply)
                }
            }
            
            // Get redemption price from oracle relayer
            const redemptionPrice = await safeCall('oracleRelayer', 'redemptionPrice')
            if (redemptionPrice) {
                const formattedRedemptionPrice = formatEther(redemptionPrice)
                
                // Apply scaling factor - the redemption price needs to be normalized from $67B to $67
                // This uses the same scale factor as the liquidationData value
                const rawRedemptionPrice = parseFloat(formattedRedemptionPrice);
                const scalingFactor = 1e9; // 10^9
                const normalizedPrice = rawRedemptionPrice / scalingFactor;
                
                result.redemptionPrice = {
                    raw: normalizedPrice.toString(),
                    formatted: formatNumberWithStyle(normalizedPrice, { 
                        maxDecimals: 2, 
                        style: 'currency' 
                    })
                }
                //console.log('[Analytics] Raw redemptionPrice:', formattedRedemptionPrice, 'normalized to:', normalizedPrice)
            }
            
            // Get market price from ETH oracle
            try {
                // Try fetching market price from different methods
                let marketPrice = null
                const ethBytes32 = ethers.utils.formatBytes32String('ETH')
                
                // Method 1: Try cParams
                const coinInfo = await safeCall('oracleRelayer', 'cParams', ethBytes32)
                if (coinInfo && coinInfo.length > 0) {
                    marketPrice = coinInfo[0]
                }
                
                // Method 2: Try oracle
                if (!marketPrice) {
                    const oracle = await safeCall('oracleRelayer', 'priceSource', ethBytes32)
                    if (oracle) {
                        const oraclePrice = await safeCall('ethOracle', 'read')
                        marketPrice = oraclePrice
                    }
                }
                
                // Method 3: Try direct price from Chainlink or other oracle
                if (!marketPrice && geb.contracts.ethPriceFeed) {
                    marketPrice = await safeCall('ethPriceFeed', 'latestAnswer')
                    // Chainlink might return scaled values, need to handle decimals
                    const decimals = await safeCall('ethPriceFeed', 'decimals') || 8
                    if (marketPrice) {
                        marketPrice = ethers.utils.parseUnits(marketPrice.toString(), 18 - decimals)
                    }
                }
                
                if (marketPrice) {
                    const formattedMarketPrice = formatEther(marketPrice)
                    
                    // Apply the same scaling factor to market price
                    const rawMarketPrice = parseFloat(formattedMarketPrice);
                    const scalingFactor = 1e9; // 10^9
                    const normalizedPrice = rawMarketPrice / scalingFactor;
                    
                    result.marketPrice = {
                        raw: normalizedPrice.toString(),
                        formatted: formatNumberWithStyle(normalizedPrice, { 
                            maxDecimals: 2, 
                            style: 'currency' 
                        })
                    }
                    //console.log('[Analytics] Raw marketPrice:', formattedMarketPrice, 'normalized to:', normalizedPrice)
                    
                    // Calculate price diff if we have both prices
                    if (redemptionPrice) {
                        const mPrice = normalizedPrice;
                        const rPrice = parseFloat(result.redemptionPrice.raw);
                        if (rPrice > 0) {
                            result.priceDiff = (mPrice - rPrice) / rPrice
                        }
                    }
                }
            } catch (error) {
                //console.warn('[Analytics]Failed to get market price:', error)
            }
            
            // After try/catch, we can now reference marketPrice from above
            // If market price is 0 or null, use redemption price instead (they should be close)
            if (redemptionPrice && (!result.marketPrice.raw || result.marketPrice.raw === '0' || result.marketPrice.raw === '0.0')) {
                result.marketPrice = { ...result.redemptionPrice };
                //console.log('[Analytics] Using redemption price as market price:', result.marketPrice.raw)
            }
            
            // Get redemption rate
            const redemptionRate = await safeCall('oracleRelayer', 'redemptionRate')
            if (redemptionRate) {
                try {
                    const annualRate = transformToAnnualRate(redemptionRate.toString(), 18)
                    const eightRate = transformToEightHourlyRate(redemptionRate.toString(), 18)
                    
                    // Check for valid rates
                    if (!isNaN(Number(annualRate))) {
                        result.annualRate = {
                            raw: annualRate.toString(),
                            formatted: `${(Number(annualRate) * 100).toFixed(2)}%`
                        }
                    }
                    
                    if (!isNaN(Number(eightRate))) {
                        result.eightRate = {
                            raw: eightRate.toString(),
                            formatted: `${(Number(eightRate) * 100).toFixed(2)}%`
                        }
                    }
                    
                    // Try to get pRate and iRate if they exist
                    try {
                        const piRateSetter = await safeCall('rateSetter', 'address')
                        if (piRateSetter) {
                            const proportionalTerm = await safeCall('rateSetter', 'proportionalTerm')
                            const integralTerm = await safeCall('rateSetter', 'integralTerm')
                            
                            if (proportionalTerm) {
                                const pRate = transformToAnnualRate(proportionalTerm.toString(), 18)
                                if (!isNaN(Number(pRate))) {
                                    result.pRate = {
                                        raw: pRate.toString(),
                                        formatted: `${(Number(pRate) * 100).toFixed(2)}%`
                                    }
                                }
                            }
                            
                            if (integralTerm) {
                                const iRate = transformToAnnualRate(integralTerm.toString(), 18)
                                if (!isNaN(Number(iRate))) {
                                    result.iRate = {
                                        raw: iRate.toString(),
                                        formatted: `${(Number(iRate) * 100).toFixed(2)}%`
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        //console.warn('[Analytics]Failed to get pRate or iRate:', error)
                    }
                } catch (error) {
                    //console.warn('[Analytics]Error calculating rates:', error);
                }
            }
            
            // Get surplus from AccountingEngine
            try {
                const systemSurplus = await safeCall('accountingEngine', 'systemSurplus')
                if (systemSurplus) {
                    const formattedSurplus = formatEther(systemSurplus)
                    result.surplusInTreasury = {
                        raw: formattedSurplus,
                        formatted: formatNumberWithStyle(formattedSurplus, { maxDecimals: 0 })
                    }
                }
            } catch (error) {
                //console.warn('[Analytics]Failed to get surplus info:', error)
            }
        } catch (error) {
            console.error('[Analytics] Error fetching contract data:', error)
        }
        
        //console.log('[Analytics] Final data:', result)
        return result
        
    } catch (error) {
        console.error('[Analytics] Error in manual data fetching:', error)
        return DEFAULT_ANALYTICS_DATA
    }
}

export function useGebAnalytics() {
    //console.log('[Analytics] useGebAnalytics was called')

    // Get the liquidation data from the store, which comes from the vault model
    const { vaultModel } = useStoreState((state) => state)
    const liquidationData = vaultModel?.liquidationData

    // Ensure we have the chain ID
    const { chain } = useNetwork()
    const geb = usePublicGeb()

    const [analyticsData, setAnalyticsData] = useState<GebAnalyticsData>(DEFAULT_ANALYTICS_DATA)
    const [refresher, forceRefresh] = useReducer((x) => x + 1, 0)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchAnalyticsData = async () => {
            try {
                // Skip if no geb instance
                if (!geb) {
                    //console.log('[Analytics] No geb instance available, skipping')
                    return
                }

                //console.log('[Analytics] Fetching analytics data...')
                const data = await fetchAnalyticsDataDirect(geb)
                
                // Get redemption price from liquidation data if available
                if (liquidationData?.currentRedemptionPrice && (!data.redemptionPrice.raw || data.redemptionPrice.raw === '0')) {
                    const currentRedemptionPrice = liquidationData.currentRedemptionPrice
                    data.redemptionPrice = {
                        raw: currentRedemptionPrice,
                        formatted: formatNumberWithStyle(currentRedemptionPrice, {
                            maxDecimals: 2,
                            style: 'currency'
                        })
                    }
                    //console.log('[Analytics] Using redemption price from liquidation data:', currentRedemptionPrice)
                }
                
                //console.log('[Analytics] Data fetched successfully:', data)
                setAnalyticsData(data)
                setError(null)
            } catch (error) {
                console.error('[Analytics] Error fetching analytics data:', error)
                setError('Failed to fetch analytics data')
            }
        }

        fetchAnalyticsData()
    }, [geb, chain?.id, refresher, liquidationData])

    return {
        analyticsData,
        forceRefresh,
        error
    }
}

export const DEFAULT_ANALYTICS_DATA: GebAnalyticsData = {
    erc20Supply: {
        raw: '',
        formatted: '--',
    },
    globalDebt: {
        raw: '',
        formatted: '--',
    },
    globalDebtUtilization: '--%',
    globalDebtCeiling: {
        raw: '',
        formatted: '--',
    },
    surplusInTreasury: {
        raw: '',
        formatted: '--',
    },
    marketPrice: {
        raw: '',
        formatted: '$--',
    },
    redemptionPrice: {
        raw: '',
        formatted: '$--',
    },
    priceDiff: 0,
    annualRate: {
        raw: '',
        formatted: '--%',
    },
    eightRate: {
        raw: '',
        formatted: '--%',
    },
    pRate: {
        raw: '',
        formatted: '--%',
    },
    iRate: {
        raw: '',
        formatted: '--%',
    },
    tokenAnalyticsData: [],
}
