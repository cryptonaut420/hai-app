import { useMemo, useState } from 'react'
import { formatUnits } from 'ethers/lib/utils'
import { useQuery } from '@apollo/client'
import { useAccount } from 'wagmi'

import type { SortableHeader, Sorting, Strategy } from '~/types'
import {
    ALL_COLLATERAL_TYPES_QUERY,
    OPTIMISM_UNISWAP_POOL_QUERY,
    OPTIMISM_UNISWAP_POOL_WITH_POSITION_QUERY,
    REWARDS,
    type QueryCollateralType,
    arrayToSorted,
    tokenAssets,
    QueryLiquidityPoolWithPositions,
    uniClient,
} from '~/utils'
import { useStoreState } from '~/store'
import { useBalance } from '~/hooks'
import { useAnalytics } from '~/providers/AnalyticsProvider'

const sortableHeaders: SortableHeader[] = [
    { label: 'Asset / Asset Pair' },
    { label: 'Strategy' },
    {
        label: 'TVP',
        tooltip: `Value participating in campaign`,
    },
    {
        label: 'My Position',
        tooltip: `Your value participating in the campaign`,
    },
    {
        label: 'Rewards APY',
        tooltip: `Variable based upon participation and value of campaign emissions`,
    },
]

export function useEarnStrategies() {
    const {
        connectWalletModel: { tokensData },
        vaultModel: { list, liquidationData },
    } = useStoreState((state) => state)

    const { address } = useAccount()
    
    const { data, loading, error } = useQuery<{ collateralTypes: QueryCollateralType[] }>(ALL_COLLATERAL_TYPES_QUERY)
    const {
        data: uniData,
        loading: uniLoading,
        error: uniError,
    } = useQuery<{ liquidityPools: QueryLiquidityPoolWithPositions[] }>(
        address ? OPTIMISM_UNISWAP_POOL_WITH_POSITION_QUERY : OPTIMISM_UNISWAP_POOL_QUERY,
        {
            client: uniClient,
            variables: {
                ids: Object.keys(REWARDS.uniswap),
                address,
            },
        }
    )

    const prices = useMemo(() => {
        return {
            PARYS: parseFloat(liquidationData?.currentRedemptionPrice || '0'),
            AGREE: 0,
            OP: parseFloat(liquidationData?.collateralLiquidationData['OP']?.currentPrice.value || '0'),
            WETH: parseFloat(liquidationData?.collateralLiquidationData['WETH']?.currentPrice.value || '0'),
        }
    }, [liquidationData?.currentRedemptionPrice, liquidationData?.collateralLiquidationData])

    const vaultStrategies = useMemo(() => {
        return (
            data?.collateralTypes
                .filter((cType) =>
                    Object.values(REWARDS.vaults[cType.id as keyof typeof REWARDS.vaults] || {}).some((a) => a != 0)
                )
                .map((cType) => {
                    const { symbol } =
                        tokenAssets[cType.id] ||
                        Object.values(tokenAssets).find(({ name }) => name.toLowerCase() === cType.id.toLowerCase()) ||
                        {}
                    const rewards = REWARDS.vaults[symbol as keyof typeof REWARDS.vaults] || REWARDS.default
                    const apy = calculateAPY(parseFloat(cType.debtAmount) * prices.PARYS, prices, rewards)
                    return {
                        pair: [symbol || 'PARYS'],
                        rewards: Object.entries(rewards).map(([token, emission]) => ({ token, emission })),
                        tvl: cType.debtAmount,
                        strategyType: 'borrow',
                        apy,
                        userPosition: list
                            .reduce((total, { totalDebt, collateralName }) => {
                                if (collateralName !== symbol) return total
                                return total + parseFloat(totalDebt)
                            }, 0)
                            .toString(),
                    } as Strategy
                }) || []
        )
    }, [data?.collateralTypes, prices, list, tokenAssets])

    const uniStrategies = useMemo(() => {
        if (!uniData?.liquidityPools.length) return []
        const temp: Strategy[] = []
        for (const pool of uniData.liquidityPools) {
            const rewards = REWARDS.uniswap[pool.id.toLowerCase()]
            if (!rewards) continue // sanity check

            const tvl =
                parseFloat(formatUnits(pool.inputTokenBalances[0], 18)) * prices.PARYS +
                parseFloat(formatUnits(pool.inputTokenBalances[1], 18)) * prices.WETH
            const apy = calculateAPY(tvl, prices, rewards)
            temp.push({
                pair: pool.inputTokens.map((token) => token.symbol) as any,
                rewards: Object.entries(rewards).map(([token, emission]) => ({ token, emission })) as any,
                tvl: tvl.toString(),
                apy,
                userPosition: (pool.positions || [])
                    .reduce((total, { cumulativeDepositTokenAmounts, cumulativeWithdrawTokenAmounts }) => {
                        const posHai =
                            parseFloat(formatUnits(cumulativeDepositTokenAmounts[0], 18)) -
                            parseFloat(formatUnits(cumulativeWithdrawTokenAmounts[0], 18))
                        const posETH =
                            parseFloat(formatUnits(cumulativeDepositTokenAmounts[1], 18)) -
                            parseFloat(formatUnits(cumulativeWithdrawTokenAmounts[1], 18))
                        return total + (posHai * prices.PARYS + posETH * prices.WETH)
                    }, 0)
                    .toString(),
                earnPlatform: 'uniswap',
                earnAddress: pool.id,
                strategyType: 'farm',
                earnLink: `https://info.uniswap.org/#/optimism/pools/${pool.id}`,
            } as Strategy)
        }
        return temp
    }, [uniData?.liquidityPools, prices])

    const haiBalance = useBalance('PARYS')
    const analytics = useAnalytics()
    const {
        data: { erc20Supply, annualRate },
    } = analytics
    const rRateApr = Number(annualRate.raw)
    const rRateApy = Math.pow(1 + rRateApr / 365, 365) - 1

    const specialStrategies = [
        {
            pair: ['PARYS'],
            rewards: [],
            tvl: erc20Supply.raw,
            apy: rRateApy,
            userPosition: haiBalance?.raw,
            strategyType: 'hold',
        },
    ]

    const strategies = useMemo(() => {
        return [...specialStrategies, ...vaultStrategies, ...uniStrategies]
    }, [specialStrategies, vaultStrategies, uniStrategies])

    const [filterEmpty, setFilterEmpty] = useState(false)

    const filteredRows = useMemo(() => {
        if (!filterEmpty) return strategies

        return strategies.filter(({ userPosition }) => !!userPosition && userPosition !== '0')
    }, [strategies, filterEmpty])

    const [sorting, setSorting] = useState<Sorting>({
        key: 'My Position',
        dir: 'desc',
    })

    const sortedRows = useMemo(() => {
        switch (sorting.key) {
            case 'Asset / Asset Pair':
                return arrayToSorted(filteredRows, {
                    getProperty: (row) => row.pair[0],
                    dir: sorting.dir,
                    type: 'alphabetical',
                })
            case 'Strategy':
                return arrayToSorted(filteredRows, {
                    getProperty: (row) => row.strategyType,
                    dir: sorting.dir,
                    type: 'alphabetical',
                })
            case 'TVP':
                return arrayToSorted(filteredRows, {
                    getProperty: (row) => row.tvl,
                    dir: sorting.dir,
                    type: 'parseFloat',
                    checkValueExists: true,
                })
            case 'Rewards APY':
                return arrayToSorted(filteredRows, {
                    getProperty: (row) => row.apy,
                    dir: sorting.dir,
                    type: 'numerical',
                })
            case 'My Position':
            default:
                return arrayToSorted(filteredRows, {
                    getProperty: (row) => row.userPosition,
                    dir: sorting.dir,
                    type: 'parseFloat',
                    checkValueExists: true,
                })
        }
    }, [filteredRows, sorting])

    return {
        headers: sortableHeaders,
        rows: sortedRows,
        rowsUnmodified: strategies,
        loading: loading || uniLoading,
        error: error?.message,
        uniError: uniError?.message,
        sorting,
        setSorting,
        filterEmpty,
        setFilterEmpty,
    }
}

const calculateAPY = (
    tvl: number,
    prices: { AGREE: number; OP: number },
    rewards: { AGREE: number; OP: number } = REWARDS.default
) => {
    if (!tvl) return 0
    if (!prices.AGREE || !prices.OP) return 0

    // ((kite-daily-emission * kite-price + op-daily-emission * op-price) * 365) / (hai-debt-per-collateral * hai-redemption-price)
    const nominal = (365 * (rewards.AGREE * prices.AGREE + rewards.OP * prices.OP)) / tvl
    return nominal === Infinity ? 0 : Math.pow(1 + nominal / 12, 12) - 1
}
