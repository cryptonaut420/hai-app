import { TOKEN_LOGOS } from '~/utils/tokens'
import { SummaryCurrency, SummaryItemValue } from './vaults'

export type SystemState = {
    currentRedemptionPrice?: {
        value: string
        timestamp?: string
        redemptionRate?: string
    }
    currentRedemptionRate?: {
        perSecondRate?: string
        eightHourlyRate?: string
        twentyFourHourlyRate?: string
        hourlyRate?: string
        annualizedRate: string
    }
    globalDebt: string
    globalDebtCeiling: string
    perSafeDebtCeiling: string
    coinAddress: string  // Required field for GraphQL schema
    wethAddress: string  // Required field for GraphQL schema
    systemSurplus: string
    debtAvailableToSettle: string
    coinUniswapPair?: string
    safeCount?: string
    unmanagedSafeCount?: string
    totalActiveSafeCount?: string
    proxyCount?: string
    globalUnbackedDebt?: string
    collateralCount?: string
    globalStabilityFee?: string
    savingsRate?: string
    collateralAuctionCount?: string
    erc20CoinTotalSupply?: string
    lastPeriodicUpdate?: string
    globalDebt24hAgo?: string
}

// Also export the old name for backwards compatibility 
export type SystemSate = SystemState

export type TokenKey = keyof typeof TOKEN_LOGOS

export type EarnStrategyReward = {
    token: TokenKey
    emission: number
}
export type Strategy = {
    pair: [TokenKey] | [TokenKey, TokenKey]
    rewards: [EarnStrategyReward] | [EarnStrategyReward, EarnStrategyReward]
    tvl: string
    apy: number
    userPosition?: string
    strategyType: 'hold' | 'borrow' | 'farm'
} & (
    | {
          earnPlatform?: undefined
          earnAddress?: undefined
          earnLink?: undefined
      }
    | {
          earnPlatform: 'uniswap'
          earnAddress: string
          earnLink: string
      }
)

export type TokenAnalyticsData = {
    symbol: string
    tokenContract?: string
    collateralJoin?: string
    totalCollateral?: string
    totalDebt?: string
    debtCeiling?: string
}

export type CollateralDebt = {
    debtAmount: string
    debtCeiling: string
    ceilingPercent: number
}

export type CollateralStat = {
    totalCollateral?: SummaryItemValue<SummaryCurrency>
    totalDebt?: SummaryItemValue<SummaryCurrency>
    ratio?: SummaryItemValue
    debt?: CollateralDebt
}
