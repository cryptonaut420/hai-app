import { useMemo } from 'react'
import { BigNumber } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'

import type { IAuction, IAuctionBidder } from '~/types'
import { formatSummaryCurrency } from '~/utils'
import { useStoreState } from '~/store'
import { Status } from '~/utils/constants'

export function useAuction(id: string) {
    const {
        auctionModel: { list: auctionList },
        vaultModel: { liquidationData },
    } = useStoreState((state) => state)

    return useMemo(() => {
        const auction = auctionList.find((a: IAuction) => a.auctionId === id)

        if (!auction) return undefined

        const currPrice = auction.biddersList[0]
            ? BigNumber.from(auction.biddersList[0].buyAmount).gt(0)
                ? BigNumber.from(auction.biddersList[0].sellAmount)
                    .mul(BigNumber.from(10).pow(18))
                    .div(BigNumber.from(auction.biddersList[0].buyAmount))
                : BigNumber.from(0)
            : BigNumber.from(0)

        const initialPrice = BigNumber.from(auction.sellInitialAmount)
            .mul(BigNumber.from(10).pow(18))
            .div(BigNumber.from(auction.buyInitialAmount))

        const buyToken = auction.buyToken
        const sellToken = auction.sellToken

        const sellDecimals = 18
        const buyDecimals = 18

        const isClosed = auction.status !== Status.LIVE

        // Get current inventory of required token
        const maxBuyAmount = '0'

        // Default value if no price is available
        const defaultPrice = '1'
        
        const buyTokenPrice = 
            buyToken === 'PARYS' ? liquidationData?.currentRedemptionPrice || defaultPrice : defaultPrice

        const sellTokenPrice = 
            sellToken && liquidationData?.collateralLiquidationData[sellToken]?.currentPrice?.value || defaultPrice

        return {
            ...auction,
            buyToken,
            buyDecimals,
            buyTokenPrice,
            sellToken,
            sellDecimals,
            sellTokenPrice,
            highestBid: auction.biddersList[0],
            currentPrice: formatUnits(currPrice.toString(), 18),
            initialPrice: formatUnits(initialPrice.toString(), 18),
            isClosed,
            maxBuyAmount,
            bids: auction.biddersList.sort((a: IAuctionBidder, b: IAuctionBidder) => {
                const aPrice = BigNumber.from(a.sellAmount).gt(0) && BigNumber.from(a.buyAmount).gt(0)
                    ? parseFloat(formatUnits(
                        BigNumber.from(a.sellAmount)
                            .mul(BigNumber.from(10).pow(18))
                            .div(BigNumber.from(a.buyAmount))
                            .toString(),
                        18
                      ))
                    : 0
                
                const bPrice = BigNumber.from(b.sellAmount).gt(0) && BigNumber.from(b.buyAmount).gt(0)
                    ? parseFloat(formatUnits(
                        BigNumber.from(b.sellAmount)
                            .mul(BigNumber.from(10).pow(18))
                            .div(BigNumber.from(b.buyAmount))
                            .toString(),
                        18
                      ))
                    : 0
                
                return bPrice - aPrice
            }),
        }
    }, [auctionList, id, liquidationData])
}
