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
} from '~/utils'
import { usePublicGeb } from '~/hooks'

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
    console.log('[Analytics] Manual data fetching...')
    
    try {
        // Check if contracts are available
        if (!geb.contracts || !geb.contracts.safeEngine) {
            console.error('[Analytics] Contracts not initialized properly')
            throw new Error('Contracts not initialized properly')
        }
        
        // Log available contract names for debugging
        console.log('[Analytics] Available contract names:', Object.keys(geb.contracts))
        
        // Initialize with default values
        const result: GebAnalyticsData = { ...DEFAULT_ANALYTICS_DATA }
        
        // Try to fetch data with proper error handling for each call
        try {
            // Create a helper function to safely call contracts
            const safeCall = async (contractName: string, methodName: string, ...args: any[]) => {
                try {
                    if (!geb.contracts[contractName]) {
                        console.warn(`[Analytics] Contract ${contractName} not available`)
                        return null
                    }
                    
                    console.log(`[Analytics] Calling ${contractName}.${methodName}()...`)
                    
                    // Check if the method exists on the contract
                    if (typeof geb.contracts[contractName][methodName] !== 'function') {
                        console.warn(`[Analytics] Method ${methodName} not found on contract ${contractName}`)
                        return null
                    }
                    
                    return await geb.contracts[contractName][methodName](...args)
                } catch (error) {
                    console.warn(`[Analytics] Error calling ${contractName}.${methodName}():`, error)
                    return null
                }
            }
            
            // Attempt to get global debt - directly access the public variable
            const globalDebt = await safeCall('safeEngine', 'globalDebt')
            if (globalDebt) {
                const formattedGlobalDebt = formatEther(globalDebt)
                // Create our own SummaryItemValue if formatSummaryValue is not working correctly
                result.globalDebt = {
                    raw: globalDebt.toString(),
                    formatted: typeof formatSummaryValue === 'function' ? 
                        (formatSummaryValue(formattedGlobalDebt)?.formatted || formattedGlobalDebt) : 
                        formattedGlobalDebt
                }
                console.log('[Analytics] Successfully fetched globalDebt:', formattedGlobalDebt)
            }
            
            // Use the _params() function to get global debt ceiling
            const params = await safeCall('safeEngine', '_params')
            if (params && params.length >= 2) {
                const globalDebtCeiling = params[1] // Second parameter is globalDebtCeiling
                const formattedGlobalDebtCeiling = formatEther(globalDebtCeiling)
                // Create SummaryItemValue manually to avoid type issues
                result.globalDebtCeiling = {
                    raw: globalDebtCeiling.toString(),
                    formatted: `$${typeof formatSummaryValue === 'function' ? 
                        (formatSummaryValue(formattedGlobalDebtCeiling)?.formatted || formattedGlobalDebtCeiling) : 
                        formattedGlobalDebtCeiling}`
                }
                console.log('[Analytics] Successfully fetched globalDebtCeiling:', formattedGlobalDebtCeiling)
                
                // Calculate utilization if we have both values
                if (globalDebt && globalDebtCeiling.gt(0)) {
                    const utilization = globalDebt.mul(100).div(globalDebtCeiling)
                    result.globalDebtUtilization = `${utilization.toString()}%`
                }
            }
            
            // Try to get redemption price from oracle relayer
            const redemptionPrice = await safeCall('oracleRelayer', 'redemptionPrice')
            if (redemptionPrice) {
                const formattedRedemptionPrice = formatEther(redemptionPrice)
                result.redemptionPrice = {
                    raw: redemptionPrice.toString(),
                    formatted: `$${typeof formatSummaryValue === 'function' ? 
                        (formatSummaryValue(formattedRedemptionPrice)?.formatted || formattedRedemptionPrice) : 
                        formattedRedemptionPrice}`
                }
                console.log('[Analytics] Successfully fetched redemptionPrice:', formattedRedemptionPrice)
            }
            
            // Try to get market price
            try {
                const coinInfo = await safeCall('oracleRelayer', 'cParams', ethers.utils.formatBytes32String('ETH'))
                if (coinInfo && coinInfo.length > 0) {
                    const marketPrice = coinInfo[0] // First parameter should be the market price
                    if (marketPrice) {
                        const formattedMarketPrice = formatEther(marketPrice)
                        result.marketPrice = {
                            raw: marketPrice.toString(),
                            formatted: `$${typeof formatSummaryValue === 'function' ? 
                                (formatSummaryValue(formattedMarketPrice)?.formatted || formattedMarketPrice) : 
                                formattedMarketPrice}`
                        }
                        console.log('[Analytics] Successfully fetched marketPrice:', formattedMarketPrice)
                    }
                }
            } catch (error) {
                console.warn('[Analytics] Failed to get market price:', error)
            }
            
        } catch (error) {
            console.error('[Analytics] Error fetching contract data:', error)
        }
        
        // Return what we have, even if incomplete
        return result
        
    } catch (error) {
        console.error('[Analytics] Error in manual data fetching:', error)
        // Return default data instead of throwing
        return DEFAULT_ANALYTICS_DATA
    }
}

export function useGebAnalytics() {
    console.log('[Analytics] useGebAnalytics was called')

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
                    console.log('[Analytics] No geb instance available, skipping')
                    return
                }

                console.log('[Analytics] Fetching analytics data...')
                const data = await fetchAnalyticsDataDirect(geb)
                console.log('[Analytics] Data fetched successfully:', data)
                setAnalyticsData(data)
                setError(null)
            } catch (error) {
                console.error('[Analytics] Error fetching analytics data:', error)
                setError('Failed to fetch analytics data')
            }
        }

        fetchAnalyticsData()
    }, [geb, chain?.id, refresher])

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
