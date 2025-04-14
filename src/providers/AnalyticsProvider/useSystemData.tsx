import { useMemo } from 'react'
import { ApolloError, useQuery } from '@apollo/client'

import type { CollateralStat, SummaryItemValue } from '~/types'
import {
    SYSTEMSTATE_QUERY,
    type QuerySystemStateData,
    formatSummaryValue,
    formatSummaryCurrency,
    formatSummaryPercentage,
    tokenAssets,
    DEPRECATED_COLLATERALS,
} from '~/utils'

export type SystemData = {
    loading: boolean
    error?: ApolloError
    data?: QuerySystemStateData
    summary?: {
        totalCollateralLocked: SummaryItemValue
        globalCRatio: SummaryItemValue
        totalVaults: SummaryItemValue
        systemSurplus: SummaryItemValue
        erc20Supply: SummaryItemValue
        redemptionPrice: SummaryItemValue
        redemptionRate: SummaryItemValue
        debtAvailableToSettle: SummaryItemValue
        collateralStats: Record<string, CollateralStat>
    }
}

export function useSystemData(): SystemData {
    const { data, loading, error } = useQuery<QuerySystemStateData>(SYSTEMSTATE_QUERY)

    const formattedData = useMemo(() => {
        console.log('[SystemData] Processing subgraph data:', data);
        
        // First guard: make sure we have data
        if (!data) {
            console.warn('[SystemData] No data received from subgraph');
            return undefined;
        }

        // Second guard: make sure we have systemStates array and it's not empty
        const systemStates = data.systemStates || []
        if (systemStates.length <= 0) {
            console.warn('[SystemData] SystemStates array is empty');
            return undefined;
        }

        // Safely access collateralTypes array
        const collateralTypes = data.collateralTypes || []
        console.log('[SystemData] Found collateral types:', collateralTypes.length);
        
        // Safely extract the first system state with fallbacks for all fields
        const systemState = systemStates[0] || {}
        console.log('[SystemData] System state:', systemState);
        
        const {
            globalDebt = '0',
            globalDebt24hAgo = '0',
            systemSurplus = '0',
            totalActiveSafeCount = '0',
            safeCount = '0',
            unmanagedSafeCount = '0',
            proxyCount = '0',
            currentRedemptionPrice = null,
            currentRedemptionRate = null,
            erc20CoinTotalSupply = '0',
            debtAvailableToSettle = '0',
            coinAddress = '0x0000000000000000000000000000000000000000',
            wethAddress = '0x0000000000000000000000000000000000000000',
            coinUniswapPair = null,
        } = systemState

        // Handle missing nested objects with default fallbacks
        const redemptionPrice = currentRedemptionPrice || { value: '1', timestamp: '0', redemptionRate: '0' }
        const redemptionRate = currentRedemptionRate || { 
            annualizedRate: '1.0', 
            perSecondRate: '1.0', 
            hourlyRate: '1.0', 
            eightHourlyRate: '1.0',
            twentyFourHourlyRate: '1.0'
        }

        console.log('[SystemData] Key metrics:', {
            globalDebt,
            redemptionPrice: redemptionPrice.value,
            totalActiveSafeCount,
            erc20CoinTotalSupply
        });

        // Filtering out deprecated collaterals
        const activeCollateralTypes = collateralTypes.filter(
            ({ id }) => !DEPRECATED_COLLATERALS.includes((id || '').toUpperCase())
        )

        console.log('[SystemData] Active collateral types:', activeCollateralTypes.length);

        const { total, collateralStats } = activeCollateralTypes.reduce(
            (stats, collateral) => {
                // Defensive access to collateral properties
                const id = collateral.id || ''
                const totalCollateralLockedInSafes = collateral.totalCollateralLockedInSafes || '0'
                const debtAmount = collateral.debtAmount || '0'
                const debtCeiling = collateral.debtCeiling || '0'
                const currentPrice = collateral.currentPrice || null

                if (currentPrice) {
                    const priceValue = currentPrice.value || '0'
                    
                    const totalCollateral = formatSummaryCurrency(totalCollateralLockedInSafes, priceValue)
                    const totalDebt = formatSummaryCurrency(debtAmount, redemptionPrice.value || '1')
                    
                    const totalCollateralUsd = parseFloat(totalCollateral?.usdRaw || '0')
                    const totalDebtUsd = parseFloat(totalDebt?.usdRaw || '0')
                    
                    const ratioRaw = totalDebtUsd > 0 ? totalCollateralUsd / totalDebtUsd : 0
                    const ratio = formatSummaryPercentage(isNaN(ratioRaw) ? '' : ratioRaw.toString())
                    
                    const key = tokenAssets[id]
                        ? id
                        : Object.values(tokenAssets).find(({ name }) => id === name)?.symbol || id

                    const debtCeilingValue = parseFloat(debtCeiling || '100')
                    const debtAmountValue = parseFloat(debtAmount || '0')
                    const debtCeilingPercent = debtCeilingValue > 0 
                        ? (debtAmountValue * 100) / debtCeilingValue 
                        : 0

                    const debt = {
                        debtAmount,
                        debtCeiling,
                        ceilingPercent: debtCeilingPercent,
                    }

                    stats.collateralStats[key] = {
                        debt,
                        totalCollateral,
                        totalDebt,
                        ratio,
                    }
                    stats.total += totalCollateralUsd
                    
                    console.log(`[SystemData] Collateral ${id}: ${totalCollateralLockedInSafes} (value: €${totalCollateralUsd})`);
                }
                return stats
            },
            { total: 0, collateralStats: {} as Record<string, CollateralStat> }
        )

        const globalDebtValue = parseFloat(globalDebt || '0')
        const redemptionPriceValue = parseFloat(redemptionPrice?.value || '1')
        const cRatio = globalDebtValue > 0 && redemptionPriceValue > 0
            ? total / (globalDebtValue * redemptionPriceValue)
            : 0

        console.log('[SystemData] Final computed values:', {
            totalCollateralLocked: total,
            globalDebtValue,
            cRatio,
            totalVaults: totalActiveSafeCount
        });

        return {
            totalCollateralLocked: formatSummaryValue(total.toString(), {
                maxDecimals: 0,
                style: 'currency',
            })!,
            collateralStats,
            globalCRatio: formatSummaryValue(cRatio.toString(), {
                maxDecimals: 1,
                style: 'percent',
            })!,
            totalVaults: formatSummaryValue(totalActiveSafeCount || '0', { maxDecimals: 0 })!,
            systemSurplus: formatSummaryValue(systemSurplus || '0', {
                maxDecimals: 0,
                // style: 'currency',
            })!,
            erc20Supply: formatSummaryValue(erc20CoinTotalSupply || '0', { maxDecimals: 0 })!,
            redemptionPrice: formatSummaryValue(redemptionPrice?.value || '0', {
                maxDecimals: 3,
                style: 'currency',
            })!,
            redemptionRate: formatSummaryValue(((Number(redemptionRate?.annualizedRate || '1') - 1)).toString(), {
                maxDecimals: 1,
                style: 'percent',
            })!,
            debtAvailableToSettle: formatSummaryValue(debtAvailableToSettle || '0', { maxDecimals: 2 })!,
        }
    }, [data])

    return {
        loading,
        error,
        data,
        summary: formattedData,
    }
}
