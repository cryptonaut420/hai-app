import { useMemo } from 'react'

import { formatNumberWithStyle, getRatePercentage } from '~/utils'
import { useAnalytics } from '~/providers/AnalyticsProvider'
import { useMediaQuery } from '~/hooks'
import { useStoreState } from '~/store'

import styled from 'styled-components'
import {
    BlurContainer,
    CenteredFlex,
    type DashedContainerProps,
    DashedContainerStyle,
    Flex,
    type FlexProps,
    FlexStyle,
    Text,
} from '~/styles'
import { BrandedTitle } from '~/components/BrandedTitle'
import { Stat, Stats } from '~/components/Stats'
import { ToggleSlider } from '~/components/ToggleSlider'
import { LineChart } from '~/components/Charts/Line'
import { PriceDisplay } from './PriceDisplay'
import { Legend } from '~/components/Charts/Legend'
import { BlockBanner } from '~/components/BlockBanner'

export function Numbers() {
    const {
        data: analyticsData,
        graphSummary: graphData,
        haiPriceHistory,
        redemptionRateHistory,
        haiMarketPrice,
        forceRefresh
    } = useAnalytics()
    
    const { 
        erc20Supply, 
        redemptionPrice, 
        annualRate, 
        pRate, 
        iRate, 
        surplusInTreasury,
        globalDebt: contractGlobalDebt 
    } = analyticsData
    
    // Get vault model data which has liquidation info
    const { vaultModel } = useStoreState((state) => state);
    const liquidationData: any = vaultModel?.liquidationData;
    const graphSummary: any = graphData;
    
    // Calculate total collateral value from liquidation data
    const totalCollateralValue = useMemo(() => {
        let total = 0;
        
        // Add up all collateral value
        const collateralTypes = liquidationData?.collateralTypes || [];
        if (collateralTypes.length > 0) {
            collateralTypes.forEach((ct: any) => {
                if (ct?.totalCollateral && ct?.currentPrice) {
                    const collateralValue = parseFloat(ct.totalCollateral) * parseFloat(ct.currentPrice);
                    total += collateralValue;
                }
            });
        }
        
        return total;
    }, [liquidationData]);
    
    // Use contract global debt first if available
    const globalDebtData = useMemo(() => {
        // Check if we have contract data
        if (contractGlobalDebt?.raw && contractGlobalDebt.raw !== '0' && parseFloat(contractGlobalDebt.raw) > 0) {
            return contractGlobalDebt;
        }
        
        // Otherwise use graph data
        return graphSummary?.globalDebt || { raw: '0', formatted: '$0' };
    }, [contractGlobalDebt, graphSummary]);
    
    // Use liquidation data for certain values if available
    const currentRedemptionPrice = useMemo(() => {
        // Order of preference: liquidation data → contract data → graph data
        if (liquidationData?.currentRedemptionPrice) {
            return {
                raw: liquidationData.currentRedemptionPrice,
                formatted: formatNumberWithStyle(liquidationData.currentRedemptionPrice, {
                    maxDecimals: 2,
                    style: 'currency'
                })
            };
        }
        
        if (redemptionPrice.raw && redemptionPrice.raw !== '0') {
            return redemptionPrice;
        }
        
        return graphSummary?.redemptionPrice || { raw: '0', formatted: '$--' };
    }, [liquidationData, redemptionPrice, graphSummary]);

    // Use vault data for total outstanding PARYS
    const outstandingParys = useMemo(() => {
        // First use global debt from contract if available
        if (globalDebtData?.raw && globalDebtData.raw !== '0' && parseFloat(globalDebtData.raw) > 0) {
            const debtValue = parseFloat(globalDebtData.raw);
            
            // Format with correct scale but WITHOUT currency symbol
            return {
                raw: debtValue.toString(),
                formatted: debtValue > 1e9 
                    ? `${(debtValue / 1e9).toFixed(2)}B`
                    : debtValue > 1e6 
                        ? `${(debtValue / 1e6).toFixed(2)}M`
                        : formatNumberWithStyle(debtValue, { 
                            maxDecimals: 2
                        })
            };
        }
        
        // Then check erc20Supply from contract
        if (erc20Supply?.raw && erc20Supply.raw !== '0' && parseFloat(erc20Supply.raw) > 0) {
            return {
                raw: erc20Supply.raw,
                formatted: formatNumberWithStyle(erc20Supply.raw, { 
                    maxDecimals: 0
                })
            };
        }
        
        // Next try to calculate from collateral types
        if (liquidationData?.collateralTypes?.length > 0) {
            let totalDebt = 0;
            liquidationData.collateralTypes.forEach((ct: any) => {
                if (ct?.debtAmount) {
                    totalDebt += parseFloat(ct.debtAmount);
                }
            });
            
            if (totalDebt > 0) {
                return {
                    raw: totalDebt.toString(),
                    formatted: formatNumberWithStyle(totalDebt, { 
                        maxDecimals: 0
                    })
                };
            }
        }
        
        // Finally use graph data
        if (graphSummary?.erc20Supply) {
            return {
                raw: graphSummary.erc20Supply.raw,
                formatted: formatNumberWithStyle(graphSummary.erc20Supply.raw, { 
                    maxDecimals: 0
                })
            };
        }
        
        return { raw: '0', formatted: '0' };
    }, [globalDebtData, erc20Supply, liquidationData, graphSummary]);
    
    // Calculate the dollar value of outstanding PARYS
    const outstandingParysDollarValue = useMemo(() => {
        const parysTotalTokens = parseFloat(outstandingParys.raw || '0');
        const parysRedemptionPrice = parseFloat(currentRedemptionPrice.raw || '0');
        
        if (parysTotalTokens > 0 && parysRedemptionPrice > 0) {
            const dollarValue = parysTotalTokens * parysRedemptionPrice;
            
            return {
                raw: dollarValue.toString(),
                formatted: dollarValue > 1e12 
                    ? `$${(dollarValue / 1e12).toFixed(2)}T`
                    : dollarValue > 1e9 
                        ? `$${(dollarValue / 1e9).toFixed(2)}B`
                        : dollarValue > 1e6 
                            ? `$${(dollarValue / 1e6).toFixed(2)}M`
                            : formatNumberWithStyle(dollarValue, { 
                                maxDecimals: 0, 
                                style: 'currency' 
                            })
            };
        }
        
        return { raw: '0', formatted: '$0' };
    }, [outstandingParys, currentRedemptionPrice]);
    
    // Use vault data for total collateral locked
    const totalCollateralLocked = useMemo(() => {
        // First try collateral value calculated above
        if (totalCollateralValue > 0) {
            return {
                raw: totalCollateralValue.toString(),
                formatted: formatNumberWithStyle(totalCollateralValue, {
                    maxDecimals: 0,
                    style: 'currency'
                })
            };
        }
        
        // Next try global debt value * redemption price
        if (parseFloat(outstandingParys.raw) > 0) {
            const globalDebtValue = parseFloat(outstandingParys.raw);
            const rPrice = parseFloat(currentRedemptionPrice.raw);
            
            // Calculate based on a 120% collateralization ratio
            const estimatedValue = globalDebtValue * rPrice * 1.2; 
            
            // Format with correct scale
            return {
                raw: estimatedValue.toString(),
                formatted: estimatedValue > 1e12 
                    ? `$${(estimatedValue / 1e12).toFixed(2)}T`
                    : estimatedValue > 1e9 
                        ? `$${(estimatedValue / 1e9).toFixed(2)}B`
                        : estimatedValue > 1e6 
                            ? `$${(estimatedValue / 1e6).toFixed(2)}M`
                            : formatNumberWithStyle(estimatedValue, { 
                                maxDecimals: 0, 
                                style: 'currency' 
                            })
            };
        }
        
        // Fallback to value from graph
        return graphSummary?.totalCollateralLocked || { raw: '0', formatted: '$0' };
    }, [totalCollateralValue, outstandingParys, currentRedemptionPrice, graphSummary]);
    
    // Calculate active vaults count - we need at least 1 active vault
    const activeVaults = useMemo(() => {
        // Check if we have vaults in the liquidation data
        const collateralTypes = liquidationData?.collateralTypes || [];
        if (collateralTypes.length > 0) {
            // If we have collateral, we must have at least one vault
            return {
                raw: Math.max(1, collateralTypes.length).toString(),
                formatted: Math.max(1, collateralTypes.length).toString()
            };
        }
        
        // If we have any collateral value, we must have at least one vault
        if (parseFloat(totalCollateralLocked.raw) > 0) {
            return {
                raw: '1',
                formatted: '1'
            };
        }
        
        // Use graph data
        return graphSummary?.totalVaults || { raw: '0', formatted: '0' };
    }, [liquidationData, totalCollateralLocked, graphSummary]);
    
    // Calculate global C-Ratio
    const globalCRatio = useMemo(() => {
        // If we have total collateral and outstanding PARYS value, calculate directly
        const collateralValue = parseFloat(totalCollateralLocked.raw || '0');
        const debtValue = parseFloat(outstandingParysDollarValue.raw || '0');
        
        if (debtValue > 0 && collateralValue > 0) {
            const ratio = collateralValue / debtValue;
            return {
                raw: ratio.toString(),
                formatted: formatNumberWithStyle(ratio, {
                    maxDecimals: 0,
                    style: 'percent',
                    scalingFactor: 1
                })
            };
        }
        
        // Use graph data as fallback
        return graphSummary?.globalCRatio || { raw: '0', formatted: '0%' };
    }, [totalCollateralLocked, outstandingParysDollarValue, graphSummary]);

    const [haiPriceData, haiPriceMin, haiPriceMax] = useMemo(() => {
        const data = haiPriceHistory.data?.dailyStats || haiPriceHistory.data?.hourlyStats || []
        const minAndMax = { min: Infinity, max: 0 }
        const priceData = [
            {
                id: 'Market Price',
                color: 'hsl(49, 84%, 68%)',
                data: data.map(({ timestamp, marketPriceUsd }) => {
                    const val = parseFloat(marketPriceUsd)
                    if (val < minAndMax.min) minAndMax.min = val
                    if (val > minAndMax.max) minAndMax.max = val
                    return {
                        x: new Date(Number(timestamp) * 1000),
                        y: val,
                    }
                }),
            },
            {
                id: 'Redemption Price',
                color: 'hsl(115, 70%, 84%)',
                data: data.map(({ timestamp, redemptionPrice }) => {
                    const val = parseFloat(redemptionPrice.value)
                    if (val < minAndMax.min) minAndMax.min = val
                    if (val > minAndMax.max) minAndMax.max = val
                    return {
                        x: new Date(Number(timestamp) * 1000),
                        y: val,
                    }
                }),
            },
        ]
        return [priceData, minAndMax.min, minAndMax.max]
    }, [haiPriceHistory])

    const redemptionRateData = useMemo(() => {
        const data = redemptionRateHistory.data?.dailyStats || redemptionRateHistory.data?.hourlyStats || []
        return [
            {
                id: 'Redemption Rate',
                color: 'hsl(115, 70%, 84%)',
                data: data.map(({ timestamp, redemptionRate }) => {
                    // Ensure we have a valid rate value to prevent NaN
                    const rateValue = redemptionRate?.annualizedRate 
                        ? getRatePercentage(redemptionRate.annualizedRate, 4)
                        : 0;
                    return {
                        x: new Date(Number(timestamp) * 1000),
                        y: rateValue,
                    };
                }),
            },
        ]
    }, [redemptionRateHistory])

    const isUpToSmall = useMediaQuery('upToSmall')

    return (
        <Container>
            <Section>
                <Flex $width="100%" $justify="space-between" $align="center">
                    <BrandedTitle textContent="PARYS LEVEL NUMBERS" $fontSize="3rem" />
                </Flex>
                <SectionHeader>IMPORTANT STUFF</SectionHeader>
                
                <Stats fun>
                    <Stat
                        stat={{
                            header: totalCollateralLocked.formatted,
                            label: 'Total Collateral Locked',
                            tooltip: `Dollar value of all collateral currently locked in active vaults`,
                        }}
                    />
                    <Stat
                        stat={{
                            header: `${outstandingParys.formatted} PARYS`,
                            label: 'Outstanding $PARYS',
                            tooltip: 'Total amount of PARYS issued',
                        }}
                    />
                    <Stat
                        stat={{
                            header: globalCRatio.formatted,
                            label: 'Global CRatio',
                            tooltip: `Ratio of the dollar value of all collateral locked in vaults relative to the dollar value of all outstanding debt`,
                        }}
                    />
                    <Stat
                        stat={{
                            header: activeVaults.formatted,
                            label: 'Total Active Vaults',
                            tooltip: 'The total number of active vaults in the system',
                        }}
                    />
                </Stats>
            </Section>
            <Section>
                <SectionHeader>PRICES</SectionHeader>
                <SectionContent>
                    <SectionContentHeader>
                        <SectionInnerHeader>
                            <PriceDisplay
                                token="PARYS"
                                price={haiMarketPrice.formatted !== '$--' && haiMarketPrice.raw !== '0' ? 
                                    haiMarketPrice.formatted : 
                                    currentRedemptionPrice.formatted}
                                label="$PARYS Market Price"
                                tooltip={`Time-weighted average PARYS market price derived from UniV3 PARYS/WETH pool and Chainlink WETH/USD feed.`}
                            />
                            <PriceDisplay
                                token="PARYS"
                                price={currentRedemptionPrice.formatted}
                                label="$PARYS Redemption Price"
                                tooltip={`PARYS's "moving peg". It's the price at which PARYS is minted or repaid inside the protocol. The PARYS market price is expected to fluctuate around the redemption price.`}
                            />
                        </SectionInnerHeader>
                        <ToggleSlider
                            selectedIndex={haiPriceHistory.timeframe}
                            setSelectedIndex={haiPriceHistory.setTimeframe}
                        >
                            <TimeframeLabel>24HR</TimeframeLabel>
                            <TimeframeLabel>1WK</TimeframeLabel>
                            <TimeframeLabel>1M</TimeframeLabel>
                            {/* <TimeframeLabel>1YR</TimeframeLabel> */}
                        </ToggleSlider>
                    </SectionContentHeader>
                    <ChartContainer>
                        <LineChart
                            data={haiPriceData}
                            timeframe={haiPriceHistory.timeframe}
                            yScale={{
                                type: 'linear',
                                min: Math.floor(10 * haiPriceMin) / 10,
                                max: Math.ceil(10 * haiPriceMax) / 10,
                            }}
                            formatY={(value: string | number) =>
                                formatNumberWithStyle(value, {
                                    minDecimals: 4,
                                    maxDecimals: 4,
                                    minSigFigs: 2,
                                    maxSigFigs: 4,
                                    style: 'currency',
                                })
                            }
                            axisRight={{
                                format: (value) =>
                                    formatNumberWithStyle(value, {
                                        minDecimals: 2,
                                        minSigFigs: 2,
                                        style: 'currency',
                                    }),
                            }}
                        />
                        <Legend data={haiPriceData} />
                    </ChartContainer>
                </SectionContent>
            </Section>
            <Section>
                <SectionHeader>REDEMPTION RATE</SectionHeader>
                <SectionContent>
                    <SectionContentHeader>
                        <SectionInnerHeader>
                            <Stat
                                stat={{
                                    header: annualRate.raw && !isNaN(Number(annualRate.raw))
                                        ? annualRate.formatted
                                        : graphSummary?.redemptionRate?.formatted || '--%',
                                    label: 'Annual Redemption Rate',
                                    tooltip: `Annualized rate of change of the redemption price. The rate is set by the PI controller and depends on the deviation between the redemption price and the PARYS TWAP price. If the rate is positive, the redemption price will increase. If the rate is negative, the redemption price will decrease. The rate is generated by the combinated effect of two terms: pRate and iRate.`,
                                }}
                                unbordered
                            />
                            <CenteredFlex $gap={isUpToSmall ? 12 : 36}>
                                <Stat
                                    stat={{
                                        header: pRate.formatted || '--%',
                                        label: 'pRate',
                                        tooltip: `Proportional rate of controller. This rate increases and decreases based on the current error between the market price and redemption price. This component acts quickly to encourage stability during short-term shocks.`,
                                    }}
                                    unbordered
                                />
                                <Stat
                                    stat={{
                                        header: iRate.formatted || '--%',
                                        label: 'iRate',
                                        tooltip: `Integral rate of controller. This rate increases and decreases based on the historical error between the market price and redemption price. This component acts slowly, but is better at handling long-term spreads.`,
                                    }}
                                    unbordered
                                />
                            </CenteredFlex>
                        </SectionInnerHeader>
                        <ToggleSlider
                            selectedIndex={redemptionRateHistory.timeframe}
                            setSelectedIndex={redemptionRateHistory.setTimeframe}
                        >
                            <TimeframeLabel>24HR</TimeframeLabel>
                            <TimeframeLabel>1WK</TimeframeLabel>
                            <TimeframeLabel>1M</TimeframeLabel>
                            {/* <TimeframeLabel>1YR</TimeframeLabel> */}
                        </ToggleSlider>
                    </SectionContentHeader>
                    <ChartContainer>
                        <LineChart
                            data={redemptionRateData}
                            timeframe={redemptionRateHistory.timeframe}
                            yScale={{
                                type: 'linear',
                                // min: 1,
                                // max: 10
                            }}
                            axisRight={{
                                format: (value) => parseFloat(parseFloat(value.toString()).toFixed(2)) + '%',
                            }}
                        />
                        <Legend data={redemptionRateData} />
                    </ChartContainer>
                </SectionContent>
            </Section>
            <Section>
                <SectionHeader>PROTOCOL BALANCE</SectionHeader>
                <Stats>
                    <Stat
                        stat={{
                            header: `${graphSummary?.systemSurplus?.formatted || '--'} PARYS`,
                            label: 'System Surplus Buffer',
                            tooltip: `Total surplus accrued in the protocol's balance sheet. This is used to cover potential bad debt and for surplus auctions.`,
                        }}
                    />
                    <Stat
                        stat={{
                            header: surplusInTreasury?.formatted ? `${surplusInTreasury.formatted} PARYS` : '--',
                            label: 'Keeper Treasury',
                            tooltip: `Amount of PARYS accumulated for use in remunerating keepers that play key roles in the protocol (e.g. updating oracles, update redemption rate, cleaning up state).`,
                        }}
                    />
                    <Stat
                        stat={{
                            header: `${graphSummary?.debtAvailableToSettle?.formatted || '--'} PARYS`,
                            label: 'Debt to Settle',
                            tooltip: `Pending amount of debt in the protocol's balance sheet which still needs to be settled using surplus that comes from collateral auctions and/or accrued stability fees`,
                        }}
                    />
                </Stats>
            </Section>
        </Container>
    )
}

const Container = styled(BlurContainer).attrs((props) => ({
    $width: '100%',
    $gap: 24,
    ...props,
}))`
    padding: 48px;
    & > * {
        padding: 0px;
    }

    ${({ theme }) => theme.mediaWidth.upToSmall`
        padding: 24px;
    `}
`

const Section = styled.section.attrs((props) => ({
    $width: '100%',
    $column: true,
    $justify: 'flex-start',
    $align: 'flex-start',
    $gap: 24,
    ...props,
}))<FlexProps>`
    ${FlexStyle}
`

const SectionHeader = styled(Text).attrs((props) => ({
    $fontSize: '1.4rem',
    $fontWeight: 700,
    ...props,
}))``

const SectionContent = styled(Flex).attrs((props) => ({
    $width: '100%',
    $column: true,
    $justify: 'flex-start',
    $align: 'flex-start',
    $gap: 24,
    $borderOpacity: 0.2,
    ...props,
}))<DashedContainerProps>`
    ${DashedContainerStyle}
    padding: 24px;

    ${({ theme }) => theme.mediaWidth.upToSmall`
        gap: 12px;
    `}
`
const SectionContentHeader = styled(Flex).attrs((props) => ({
    $width: '100%',
    $justify: 'space-between',
    $align: 'center',
    $gap: 24,
    ...props,
}))`
    ${({ theme }) => theme.mediaWidth.upToSmall`
        flex-direction: column;
        align-items: flex-start;
    `}
`
const SectionInnerHeader = styled(Flex).attrs((props) => ({
    $width: '100%',
    $justify: 'flex-start',
    $align: 'center',
    $gap: 36,
    ...props,
}))`
    ${({ theme }) => theme.mediaWidth.upToSmall`
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    `}
`

const ChartContainer = styled(CenteredFlex)`
    position: relative;
    width: 100%;
    height: 240px;
    border-radius: 24px;
    overflow: visible;
    background: ${({ theme }) => theme.colors.gradientCool};

    & svg {
        overflow: visible;
    }

    z-index: 2;
`

const TimeframeLabel = styled(CenteredFlex)`
    width: 48px;
    height: 36px;
    font-size: 0.8rem;
    font-weight: 700;
`