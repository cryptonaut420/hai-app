import { useEffect, useReducer, useState } from 'react'
import { formatEther } from 'ethers/lib/utils'
import { Geb } from '@parisii-inc/parys-sdk'
import { useNetwork } from 'wagmi'

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
        const globalDebt = await geb.contracts.safeEngine.globalDebt()
        console.log('[Analytics] Global debt:', globalDebt.toString())
        
        const globalDebtCeiling = await geb.contracts.safeEngine.globalDebtCeiling()
        console.log('[Analytics] Global debt ceiling:', globalDebtCeiling.toString())
        
        const coinContract = geb.contracts.coin
        const erc20Supply = await coinContract.totalSupply()
        console.log('[Analytics] ERC20 supply:', erc20Supply.toString())
        
        const redemptionPrice = await geb.contracts.oracleRelayer.redemptionPrice()
        console.log('[Analytics] Redemption price:', redemptionPrice.toString())
        
        const redemptionRate = await geb.contracts.oracleRelayer.redemptionRate()
        console.log('[Analytics] Redemption rate:', redemptionRate.toString())
        
        const marketPrice = redemptionPrice
        
        const surplusInTreasury = await geb.contracts.accountingEngine.extraSurplus()
        
        return {
            globalDebt,
            globalDebtCeiling,
            erc20Supply,
            redemptionPrice,
            marketPrice,
            redemptionRate,
            redemptionRatePTerm: redemptionRate,
            redemptionRateITerm: redemptionRate,
            surplusInTreasury,
            tokenAnalyticsData: {}
        }
    } catch (error) {
        console.error('[Analytics] Error in manual data fetching:', error)
        throw error
    }
}

export function useGebAnalytics() {
    const { chain } = useNetwork()
    const geb = usePublicGeb()

    const [refresher, forceRefresh] = useReducer((x) => x + 1, 0)
    const [data, setData] = useState(DEFAULT_ANALYTICS_DATA)

    useEffect(() => {
        if (!geb) {
            console.log('[Analytics] Geb SDK not initialized yet')
            return
        }

        console.log('[Analytics] Fetching analytics data with chain:', chain?.id)

        const getData = async () => {
            try {
                console.log('[Analytics] Using Geb SDK with network:', geb.network)
                
                if (!geb.contracts?.oracleRelayer?.address) {
                    console.error('[Analytics] Oracle Relayer contract not initialized')
                    return
                }
                
                const result = await fetchAnalyticsDataDirect(geb)
                console.log('[Analytics] Data fetched successfully')
                
                const marketPrice = formatEther(result.marketPrice).toString()
                const redemptionPrice = formatEther(result.redemptionPrice).toString()
                const priceDiff = 100 * Math.abs(1 - parseFloat(marketPrice) / parseFloat(redemptionPrice))

                setData((d) => ({
                    ...d,
                    erc20Supply: formatSummaryValue(formatEther(result.erc20Supply).toString(), { maxDecimals: 0 })!,
                    globalDebt: formatSummaryValue(formatEther(result.globalDebt).toString(), {
                        maxDecimals: 0,
                    })!,
                    globalDebtCeiling: formatSummaryValue(formatEther(result.globalDebtCeiling).toString(), {
                        maxDecimals: 0,
                        style: 'currency',
                    })!,
                    globalDebtUtilization: transformToWadPercentage(result.globalDebt, result.globalDebtCeiling),
                    surplusInTreasury: formatSummaryValue(formatEther(result.surplusInTreasury).toString(), {
                        maxDecimals: 0,
                    })!,
                    marketPrice: formatSummaryValue(marketPrice, {
                        minDecimals: 4,
                        maxDecimals: 4,
                        maxSigFigs: 4,
                        style: 'currency',
                    })!,
                    redemptionPrice: formatSummaryValue(redemptionPrice, {
                        minDecimals: 4,
                        maxDecimals: 4,
                        maxSigFigs: 4,
                        style: 'currency',
                    })!,
                    priceDiff,
                    annualRate: formatSummaryValue(transformToAnnualRate(result.redemptionRate, 27, true).toString(), {
                        maxDecimals: 1,
                        style: 'percent',
                    })!,
                    eightRate: formatSummaryValue(
                        transformToEightHourlyRate(result.redemptionRate, 27, true).toString(),
                        {
                            maxDecimals: 1,
                            style: 'percent',
                        }
                    )!,
                    pRate: formatSummaryValue(transformToAnnualRate(result.redemptionRatePTerm, 27, true).toString(), {
                        maxDecimals: 1,
                        style: 'percent',
                    })!,
                    iRate: formatSummaryValue(transformToAnnualRate(result.redemptionRateITerm, 27, true).toString(), {
                        maxDecimals: 1,
                        style: 'percent',
                    })!,
                    tokenAnalyticsData: Object.keys(result.tokenAnalyticsData || {})
                        .filter((key) => !DEPRECATED_COLLATERALS.includes(key.toUpperCase()))
                        .map((key) => ({
                            symbol: key,
                            tokenPrice: "0",
                            totalCollateral: "0",
                            debtCeiling: "0", 
                            debtCeilingUtilization: "0%",
                            stabilityFee: "0%",
                            totalDebt: "0",
                            collateralRatio: "0%",
                            liquidationRatio: "0%", 
                            tokenContract: geb.tokenList?.[key]?.address,
                            collateralJoin: geb.tokenList?.[key]?.collateralJoin,
                        })),
                }))
            } catch (e: any) {
                console.error('[Analytics] Error fetching data:', e)
                if (e.message?.includes('ENS')) {
                    console.error('[Analytics] ENS resolution error detected - check for empty addresses in contract config')
                }
            }
        }
        getData()
    }, [geb, chain?.id, refresher])

    return {
        data,
        forceRefresh,
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
