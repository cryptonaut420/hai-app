import { useMemo } from 'react'

import { useQuery } from '@apollo/client'

import {
    OPTIMISM_UNISWAP_POOL_QUERY,
    type QueryLiquidityPool,
    REWARDS,
    uniClient,
    type QueryUniswapPair,
    UNISWAP_PAIRS_QUERY,
    formatUniswapPair,
    type FormattedUniswapPair,
} from '~/utils'
import { useStoreState } from '~/store'

export type PoolAnalytics = {
    uniPools: QueryLiquidityPool[]
    uniPrice?: FormattedUniswapPair
    loading: boolean
    error: string
}

const uniHaiWethPool1Percent = '0x2A087fd694DeBec1ED61E0740BD0810b804da8f0'.toLowerCase()

export function usePoolAnalytics() {
    const {
        connectWalletModel: { tokensData },
    } = useStoreState((state) => state)

    const {
        data: uniData,
        loading: uniLoading,
        error: uniError,
    } = useQuery<{ liquidityPools: QueryLiquidityPool[] }>(OPTIMISM_UNISWAP_POOL_QUERY, {
        client: uniClient,
        variables: {
            ids: [...Object.keys(REWARDS.uniswap), uniHaiWethPool1Percent],
        },
    })

    const { data: uniPriceData } = useQuery<{ uniswapPairs: QueryUniswapPair[] }>(UNISWAP_PAIRS_QUERY)

    return {
        uniPools: uniData?.liquidityPools || [],
        uniPrice: useMemo(() => {
            if (!uniPriceData?.uniswapPairs.length || !tokensData) return undefined
            return formatUniswapPair(uniPriceData.uniswapPairs[0], tokensData)
        }, [uniPriceData, tokensData]),
        loading: uniLoading,
        error: uniError?.message,
    } as PoolAnalytics
}
