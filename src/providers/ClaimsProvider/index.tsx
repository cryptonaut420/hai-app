import { createContext, useContext } from 'react'
import { ApolloError } from '@apollo/client'

import { ReactChildren, SummaryCurrency, SummaryItemValue } from '~/types'
import { formatSummaryValue } from '~/utils'
import { useInternalBalances } from './useInternalBalances'
import { type FormattedQueryAuctionBid, useMyActiveAuctions } from './useMyActiveAuctions'

type ClaimsContext = {
    internalBalances: {
        PARYS?: SummaryItemValue<SummaryCurrency>
        AGREE?: SummaryItemValue<SummaryCurrency>
        refetch?: () => void
    }
    incentivesData: {
        AGREE?: SummaryItemValue<SummaryCurrency>
        OP?: SummaryItemValue<SummaryCurrency>
        refetch?: () => void
    }
    refetchIncentives: () => void
    activeAuctions: {
        bids: FormattedQueryAuctionBid[]
        activeBids: FormattedQueryAuctionBid[]
        activeBidsValue: SummaryItemValue
        claimableAuctions: FormattedQueryAuctionBid[]
        claimableAssetValue: SummaryItemValue
        loading: boolean
        error?: ApolloError
        refetch: () => void
    }
    totalUSD: SummaryItemValue
}

const defaultTokenMetadata = {
    raw: '0',
    formatted: '0',
    usdRaw: '0',
    usdFormatted: '$--',
}

const defaultState: ClaimsContext = {
    internalBalances: {
        PARYS: defaultTokenMetadata,
        AGREE: defaultTokenMetadata,
    },
    incentivesData: {
        AGREE: defaultTokenMetadata,
        OP: defaultTokenMetadata,
    },
    refetchIncentives: () => undefined,
    activeAuctions: {
        bids: [],
        activeBids: [],
        activeBidsValue: {
            raw: '0',
            formatted: '$--',
        },
        claimableAuctions: [],
        claimableAssetValue: {
            raw: '0',
            formatted: '$--',
        },
        loading: false,
        refetch: () => undefined,
    },
    totalUSD: {
        raw: '0',
        formatted: '$--',
    },
}

const ClaimsContext = createContext<ClaimsContext>(defaultState)

export const useClaims = () => useContext(ClaimsContext)

type Props = {
    children: ReactChildren
}
export function ClaimsProvider({ children }: Props) {
    const internalBalances = useInternalBalances()
    const activeAuctions = useMyActiveAuctions()

    // Use empty incentives data to avoid errors
    const incentivesData = {
        AGREE: defaultTokenMetadata,
        OP: defaultTokenMetadata,
    }
    
    const totalUSD = formatSummaryValue(
        (
            parseFloat(internalBalances.PARYS?.usdRaw || '0') +
            parseFloat(internalBalances.AGREE?.usdRaw || '0') +
            parseFloat(activeAuctions.claimableAssetValue.raw)
        ).toString(),
        { style: 'currency', minDecimals: 2, maxDecimals: 2 }
    )!

    return (
        <ClaimsContext.Provider
            value={{
                internalBalances,
                incentivesData,
                refetchIncentives: () => {}, // Empty function 
                activeAuctions,
                totalUSD,
            }}
        >
            {children}
        </ClaimsContext.Provider>
    )
}
