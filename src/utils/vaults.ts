import { BigNumber } from '@ethersproject/bignumber'
import { utils as gebUtils } from '@parisii-inc/parys-sdk'
import numeral from 'numeral'

import type { CollateralLiquidationData, ILiquidationData, IVault, IVaultData } from '~/types'
import { Status } from './constants'
import { formatNumber, toFixedString } from './formatting'
import { returnTotalValue } from './math'
import { QueryConfiscateSAFECollateralAndDebt, QueryModifySAFECollateralization, type QuerySafe } from './graphql'
import { tokenAssets } from './tokens'

// Define TokenData interface locally since it's missing from the SDK
interface TokenData {
    symbol: string;
    name: string;
    balance?: string;
    decimals?: number;
    address?: string;
    price?: string;
    priceSymbol?: string;
    [key: string]: any;
}

export enum VaultAction {
    DEPOSIT_BORROW,
    DEPOSIT_REPAY,
    WITHDRAW_BORROW,
    WITHDRAW_REPAY,
    CREATE,
    INFO,
}

export enum VaultInfoError {
    NO_WALLET,
    NO_PROXY,
    INSUFFICIENT_COLLATERAL,
    INSUFFICIENT_PARYS,
    WITHDRAW_EXCEEDS_COLLATERAL,
    REPAY_EXCEEDS_OWED,
    ZERO_AMOUNT,
    DEBT_TOTAL,
    COLLATERAL_RATIO,
    GLOBAL_DEBT_CEILING,
    PARYS_DEBT_CEILING,
    INDIVIDUAL_DEBT_CEILING,
    MINIMUM_MINT,
}
export const vaultInfoErrors: Record<number, string> = {
    [VaultInfoError.NO_WALLET]: `Connect a valid wallet to continue`,
    [VaultInfoError.NO_PROXY]: `Create a proxy contract to continue`,
    [VaultInfoError.INSUFFICIENT_COLLATERAL]: `Insufficient collateral balance`,
    [VaultInfoError.INSUFFICIENT_PARYS]: `Insufficient PARYS balance`,
    [VaultInfoError.WITHDRAW_EXCEEDS_COLLATERAL]: `Withdraw amount cannot exceed collateral balance`,
    [VaultInfoError.REPAY_EXCEEDS_OWED]: `Repay amount cannot exceed PARYS debt balance`,
    [VaultInfoError.ZERO_AMOUNT]: `Please enter a non-zero amount of collateral and/or PARYS`,
    [VaultInfoError.GLOBAL_DEBT_CEILING]: `Cannot exceed global debt ceiling`,
    [VaultInfoError.PARYS_DEBT_CEILING]: `Cannot exceed PARYS debt ceiling`,
    [VaultInfoError.MINIMUM_MINT]: `You must mint at least 1 PARYS to create a Vault`,
}

export const DEFAULT_VAULT_DATA: IVaultData = {
    totalCollateral: '',
    totalDebt: '',
    deposit: '',
    withdraw: '',
    borrow: '',
    repay: '',
    collateralRatio: 0,
    liquidationPrice: 0,
    collateral: '',
}

export const formatUserVault = (
    vaults: Array<any>,
    liquidationData: ILiquidationData,
    tokensData: Record<string, TokenData>
): Array<IVault> => {
    const collateralBytes32: Record<string, string> = Object.values(tokensData)
        .filter((token) => token.isCollateral)
        .reduce(
            (accum, token) => ({
                ...accum,
                [token.bytes32String]: token.symbol,
            }),
            {}
        )

    const { currentRedemptionPrice, currentRedemptionRate, collateralLiquidationData } = liquidationData

    return vaults
        .filter((s) => s.collateralType in collateralBytes32)
        .map((s) => {
            const token = collateralBytes32[s.collateralType]
            const {
                accumulatedRate,
                currentPrice,
                liquidationCRatio,
                safetyCRatio,
                liquidationPenalty,
                totalAnnualizedStabilityFee,
            } = collateralLiquidationData[token] || {}

            const availableDebt = returnAvaiableDebt(currentPrice?.safetyPrice, '0', s.collateral, s.debt)

            const totalDebt = returnTotalValue(returnTotalDebt(s.debt, accumulatedRate) as string, '0').toString()

            const liquidationPrice = getLiquidationPrice(
                s.collateral,
                totalDebt,
                liquidationCRatio,
                currentRedemptionPrice
            )

            const collateralRatio = !Number(totalDebt || '0')
                ? ''
                : getCollateralRatio(s.collateral, totalDebt, currentPrice?.liquidationPrice, liquidationCRatio)

            return {
                id: s.safeId || s.vaultId,
                vaultHandler: s.safeHandler || s.vaultHandler,
                date: s.createdAt,
                riskState: ratioChecker(!collateralRatio ? Infinity : Number(collateralRatio), Number(safetyCRatio)),
                collateral: s.collateral,
                collateralType: s.collateralType,
                collateralName: collateralBytes32[s.collateralType],
                debt: s.debt,
                totalDebt,
                availableDebt,
                accumulatedRate,
                freeCollateral: s.freeCollateral,
                collateralRatio,
                currentRedemptionPrice,
                internalCollateralBalance: s.internalCollateralBalance?.balance || '0',
                currentLiquidationPrice: currentPrice?.liquidationPrice,
                liquidationCRatio: liquidationCRatio || '1',
                liquidationPenalty: liquidationPenalty || '1',
                liquidationPrice,
                totalAnnualizedStabilityFee: totalAnnualizedStabilityFee || '0',
                currentRedemptionRate: currentRedemptionRate || '0',
            } as IVault
        })
        .sort((a, b) => Number(b.riskState) - Number(a.riskState) || Number(b.debt) - Number(a.debt))
}

export const getCollateralRatio = (
    totalCollateral: string,
    totalDebt: string,
    liquidationPrice: string,
    liquidationCRatio: string
) => {
    // Add debug logging
/*     console.log('Calculating collateral ratio with:', {
        totalCollateral,
        totalDebt,
        liquidationPrice,
        liquidationCRatio
    }); */

    if (Number(totalCollateral) === 0) {
        return '0'
    } else if (Number(totalDebt) === 0) {
        return '∞'
    }
    
    // Convert to numbers for more reliable calculation
    const collateralNum = parseFloat(totalCollateral);
    const debtNum = parseFloat(totalDebt);
    const liquidationPriceNum = parseFloat(liquidationPrice);
    const liquidationCRatioNum = parseFloat(liquidationCRatio);
    
    // If any values are NaN, return a default
    if (isNaN(collateralNum) || isNaN(debtNum)) {
        console.error('Invalid inputs for collateral ratio calculation');
        return '0';
    }
    
    // If liquidation price or ratio is 0 or invalid, use a simplified calculation
    if (isNaN(liquidationPriceNum) || liquidationPriceNum === 0 || 
        isNaN(liquidationCRatioNum) || liquidationCRatioNum === 0) {
        
        // Simplified calculation - just use collateral/debt ratio (assuming a 1:1 price)
        // This will at least give us a value above 0 if there's enough collateral
        const baseRatio = (collateralNum / debtNum) * 100;
        console.log('Using simplified ratio calculation:', baseRatio);
        return formatNumber(baseRatio.toString(), 2, true);
    }
    
    // Calculate: (collateral * liquidationPrice * liquidationCRatio / totalDebt) * 100
    const ratio = (collateralNum * liquidationPriceNum * liquidationCRatioNum / debtNum) * 100;
    
    // Log the result
    console.log('Calculated ratio:', ratio);
    
    // If the calculated ratio is 0 but we have collateral and debt, use the simplified calculation
    if (ratio <= 0 && collateralNum > 0 && debtNum > 0) {
        const baseRatio = (collateralNum / debtNum) * 100;
        console.log('Calculation resulted in 0, using simplified ratio:', baseRatio);
        return formatNumber(baseRatio.toString(), 2, true);
    }
    
    // Format the result
    return formatNumber(ratio.toString(), 2, true);
}

export const getMinimumAllowableCollateral = (totalDebt: string, liquidationPrice: string) => {
    if (Number(totalDebt) === 0) {
        return '0'
    }

    const numerator = numeral(totalDebt)

    const denominator = numeral(liquidationPrice).value()

    const value = numerator.divide(denominator)

    return value.value().toString()
}

export const getLiquidationPrice = (
    totalCollateral: string,
    totalDebt: string,
    liquidationCRatio: string,
    currentRedemptionPrice: string
) => {
    if (Number(totalCollateral) === 0) {
        return '0'
    } else if (Number(totalDebt) === 0) {
        return '0'
    }

    // Convert to numbers to avoid string manipulation issues
    const collateralNum = parseFloat(totalCollateral);
    const debtNum = parseFloat(totalDebt);
    const liquidationCRatioNum = parseFloat(liquidationCRatio);
    const redemptionPriceNum = parseFloat(currentRedemptionPrice);
    
    if (isNaN(collateralNum) || isNaN(debtNum) || isNaN(liquidationCRatioNum) || isNaN(redemptionPriceNum)) {
        console.warn('getLiquidationPrice received invalid inputs:', { totalCollateral, totalDebt, liquidationCRatio, currentRedemptionPrice });
        return '0';
    }
    
    // Calculate liquidation price: (debt * liquidationCRatio * redemptionPrice) / collateral
    const price = (debtNum * liquidationCRatioNum * redemptionPriceNum) / collateralNum;
    
    return formatNumber(price.toString());
}

export const vaultIsSafe = (totalCollateral: string, totalDebt: string, safetyPrice: string) => {
    if (isNaN(Number(totalDebt))) return true
    const totalDebtBN = BigNumber.from(toFixedString(totalDebt, 'WAD'))
    const totalCollateralBN = BigNumber.from(toFixedString(totalCollateral, 'WAD'))
    const safetyPriceBN = BigNumber.from(toFixedString(safetyPrice, 'RAY'))
    return totalDebtBN.lte(totalCollateralBN.mul(safetyPriceBN).div(gebUtils.RAY))
}

export enum RiskState {
    UNKNOWN,
    NO_DEBT,
    LOW,
    MEDIUM,
    HIGH,
    LIQUIDATION,
}
export const ratioChecker = (currentLiquitdationRatio: number, minLiquidationRatio: number) => {
    const minLiquidationRatioPercent = minLiquidationRatio * 100
    const safestRatio = minLiquidationRatioPercent * 2.2
    const midSafeRatio = minLiquidationRatioPercent * 1.5

    if (currentLiquitdationRatio < minLiquidationRatioPercent && currentLiquitdationRatio > 0) {
        return RiskState.LIQUIDATION
    } else if (currentLiquitdationRatio === Infinity) {
        return RiskState.NO_DEBT
    } else if (currentLiquitdationRatio >= safestRatio) {
        return RiskState.LOW
    } else if (currentLiquitdationRatio < safestRatio && currentLiquitdationRatio >= midSafeRatio) {
        return RiskState.MEDIUM
    } else if (currentLiquitdationRatio < midSafeRatio && currentLiquitdationRatio > 0) {
        return RiskState.HIGH
    } else {
        return RiskState.UNKNOWN
    }
}

export const getInterestOwed = (debt: string, accumulatedRate: string) => {
    const restAcc = numeral(accumulatedRate).subtract(1).value()
    return formatNumber(numeral(debt).multiply(restAcc).value().toString(), 4, true)
}

export const returnAvaiableDebt = (
    safetyPrice: string,
    accumulatedRate: string,
    currentCollatral = '0',
    prevCollatral = '0',
    prevDebt = '0'
) => {
    if (!safetyPrice || accumulatedRate === '0') {
        return '0'
    }

    const safetyPriceRay = BigNumber.from(BigNumber.from(toFixedString(safetyPrice, 'RAY')))
    const accumulatedRateRay = BigNumber.from(BigNumber.from(toFixedString(accumulatedRate, 'RAY')))
    const totalCollateralBN = returnTotalValue(currentCollatral, prevCollatral, false) as BigNumber

    const totalDebtBN = totalCollateralBN.mul(safetyPriceRay).div(gebUtils.RAY)
    const prevDebtBN = BigNumber.from(toFixedString(prevDebt, 'WAD'))
    const totalPrevDebt = prevDebtBN.mul(accumulatedRateRay).div(gebUtils.RAY)
    const availableDebt = totalDebtBN.sub(totalPrevDebt)
    return formatNumber(
        gebUtils.wadToFixed(availableDebt.lt(0) ? BigNumber.from('0') : availableDebt).toString()
    ).toString()
}

export const returnTotalDebt = (debt: string, accumulatedRate: string, beautify = true) => {
    const debtBN = BigNumber.from(toFixedString(debt, 'WAD'))
    const accumulatedRateBN = BigNumber.from(toFixedString(accumulatedRate, 'RAY'))

    const totalDebtBN = debtBN.mul(accumulatedRateBN).div(gebUtils.RAY)

    if (!beautify) return totalDebtBN
    return gebUtils.wadToFixed(totalDebtBN).toString()
}

export const returnTotalDebtPlusInterest = (
    safetyPrice: string,
    collateral: string,
    accumulatedRate: string,
    beautify = true
) => {
    if (!safetyPrice || !collateral || !accumulatedRate) {
        return '0'
    }
    const safetyPriceRay = BigNumber.from(BigNumber.from(toFixedString(safetyPrice, 'RAY')))
    const collateralBN = BigNumber.from(toFixedString(collateral, 'WAD'))
    const accumulatedRateBN = BigNumber.from(toFixedString(accumulatedRate, 'RAY'))
    const owedPARYS = collateralBN.mul(safetyPriceRay).mul(accumulatedRateBN).div(gebUtils.RAY).div(gebUtils.RAY)

    if (!beautify) return owedPARYS
    return formatNumber(gebUtils.wadToFixed(owedPARYS).toString()).toString()
}

export const riskStateToStatus: Record<RiskState | number, Status> = {
    [RiskState.NO_DEBT]: Status.NO_DEBT,
    [RiskState.LOW]: Status.SAFE,
    [RiskState.MEDIUM]: Status.OKAY,
    [RiskState.HIGH]: Status.UNSAFE,
    [RiskState.LIQUIDATION]: Status.DANGER,
    [RiskState.UNKNOWN]: Status.UNKNOWN,
}
export const returnState = (state: number) => {
    switch (state) {
        case 1:
            return 'Low'
        case 2:
            return 'Medium'
        case 3:
            return 'High'
        case 4:
            return 'Liquidation'
        default:
            return ''
    }
}

export type QueriedVault = QuerySafe & {
    totalDebt: string
    collateralToken: string
    collateralRatio: string
    status: Status
    liquidationData: CollateralLiquidationData
    liquidationPrice: string
    activity: ({
        type?: 'confiscate' | 'modify'
    } & (QueryConfiscateSAFECollateralAndDebt | QueryModifySAFECollateralization))[]
}
export const formatQuerySafeToVault = (
    safe: QuerySafe,
    collateralLiquidationData: Record<string, CollateralLiquidationData>,
    currentRedemptionPrice: string,
    confiscateSAFECollateralAndDebts: QueryConfiscateSAFECollateralAndDebt[] = [],
    modifySAFECollateralization: QueryModifySAFECollateralization[] = []
): QueriedVault => {
    // Check if safe has necessary properties
    if (!safe) {
        console.error('Invalid safe data in formatQuerySafeToVault: safe is null or undefined');
        return createDefaultVault();
    }
    
    if (!safe.collateralType) {
        console.error('Invalid safe data in formatQuerySafeToVault: missing collateralType', safe);
        return {
            ...safe,
            totalDebt: safe.debt || '0',
            collateralRatio: Infinity.toString(),
            collateralToken: 'UNKNOWN',
            status: Status.UNKNOWN,
            liquidationData: createDefaultLiquidationData(),
            liquidationPrice: '0',
            activity: [],
        };
    }

    // Determine collateral token
    const collateralTypeId = safe.collateralType?.id || '';
    const collateralToken =
        Object.values(tokenAssets).find(
            ({ name, symbol }) => collateralTypeId === name || collateralTypeId === symbol
        )?.symbol || collateralTypeId.toUpperCase();

    // Check if collateralLiquidationData is valid
    if (!collateralLiquidationData) {
        console.error('collateralLiquidationData is null or undefined');
        return createSafeVaultWithDefaults(safe, collateralToken);
    }

    // Check if collateralLiquidationData has the collateralToken
    if (!collateralLiquidationData[collateralToken]) {
        console.error('Missing collateralLiquidationData for token:', collateralToken);
        return createSafeVaultWithDefaults(safe, collateralToken);
    }

    try {
        // Get collateral data
        const collateralData = collateralLiquidationData[collateralToken];
        
        // Safety check for accumulated rate
        const accumulatedRate = collateralData.accumulatedRate || '1';
        
        // Calculate total debt using accumulated rate (this accounts for stability fees)
        const totalDebt = returnTotalDebt(safe.debt || '0', accumulatedRate) as string;
        
        // Get current price data from collateral
        const currentPrice = collateralData.currentPrice || safe.collateralType?.currentPrice;
        if (!currentPrice) {
            console.error('Missing price data for collateral', collateralToken);
            return createSafeVaultWithDefaults(safe, collateralToken);
        }
        
        // Get safety and liquidation prices
        const liquidationPrice = currentPrice.liquidationPrice;
        const safetyPrice = currentPrice.safetyPrice;
        
        // Get liquidation ratio
        const liquidationCRatio = collateralData.liquidationCRatio || safe.collateralType?.liquidationCRatio || '1';
        const safetyCRatio = collateralData.safetyCRatio || safe.collateralType?.safetyCRatio || '0';
        
        // Log critical values for debugging
        console.log('Vault calculation data:', {
            safeId: safe.safeId,
            collateral: safe.collateral || '0',
            debt: safe.debt || '0',
            totalDebt,
            accumulatedRate,
            liquidationPrice,
            safetyPrice,
            liquidationCRatio,
            safetyCRatio,
            collateralType: collateralTypeId,
            resolvedToken: collateralToken,
            currentPrice: currentPrice,
            priceValue: currentPrice.value,
            collateralValue: parseFloat(safe.collateral || '0') * parseFloat(currentPrice.value || '0'),
            debtValue: parseFloat(totalDebt) * parseFloat(currentRedemptionPrice || '1')
        });

        // Calculate collateral ratio
        let collateralRatio;
        if (!safe.debt || safe.debt === '0' || parseFloat(safe.debt) === 0) {
            collateralRatio = Infinity.toString();
        } else {
            // Use existing c-ratio if valid
            if (safe.cRatio && parseFloat(safe.cRatio) > 0) {
                collateralRatio = safe.cRatio;
            } else {
                // Calculate the ratio using the proper price data
                // This is the correct formula: (collateral × collateralPrice) / (debt × redemptionPrice)
                const collateralValue = parseFloat(safe.collateral || '0') * parseFloat(currentPrice.value || '0');
                const debtValue = parseFloat(totalDebt) * parseFloat(currentRedemptionPrice || '1');
                
                if (debtValue <= 0) {
                    collateralRatio = Infinity.toString();
                } else {
                    // This is the ratio in decimal form, multiply by 100 for percentage
                    const ratio = (collateralValue / debtValue) * 100;
                    console.log(`Calculated collateral ratio: ${ratio}% for vault ${safe.safeId}`);
                    collateralRatio = formatNumber(ratio.toString(), 2, true);
                }
            }
        }
        
        // Determine risk state based on collateral ratio and safety ratio
        const parsedRatio = parseFloat(collateralRatio);
        const parsedSafety = parseFloat(safetyCRatio);
        const status =
            collateralRatio === Infinity.toString() ? 
            Status.NO_DEBT :
            riskStateToStatus[ratioChecker(
                isNaN(parsedRatio) ? 0 : parsedRatio, 
                isNaN(parsedSafety) ? 0 : parsedSafety
            )];
        
        // Calculate liquidation price: at what collateral price would the vault hit liquidation ratio
        const liquidationPriceValue = getLiquidationPrice(
            safe.collateral || '0',
            totalDebt,
            liquidationCRatio,
            currentRedemptionPrice || '1'
        );
        
        // Return the formatted vault
        return {
            ...safe,
            totalDebt,
            collateralRatio,
            collateralToken,
            status,
            liquidationData: collateralLiquidationData[collateralToken],
            liquidationPrice: liquidationPriceValue,
            activity: [
                ...(modifySAFECollateralization || []),
                ...confiscateSAFECollateralAndDebts.map((obj) => ({ ...obj, type: 'confiscate' })),
            ].sort(({ createdAt: a }, { createdAt: b }) => parseInt(b) - parseInt(a)) as any,
        };
    } catch (error) {
        console.error('Error in formatQuerySafeToVault:', error, { safe, collateralToken });
        return createSafeVaultWithDefaults(safe, collateralToken);
    }
};

// Helper function to create a vault with defaults based on a safe
function createSafeVaultWithDefaults(safe: QuerySafe, collateralToken: string): QueriedVault {
    return {
        ...safe,
        totalDebt: safe.debt || '0',
        collateralRatio: safe.debt && parseFloat(safe.debt) > 0 ? '0' : Infinity.toString(),
        collateralToken,
        status: safe.debt && parseFloat(safe.debt) > 0 ? Status.UNKNOWN : Status.NO_DEBT,
        liquidationData: createDefaultLiquidationData(),
        liquidationPrice: '0',
        activity: [],
        // Make sure these exist with sensible defaults if they don't
        collateralType: safe.collateralType || {
            id: '',
            safetyCRatio: '0',
            liquidationCRatio: '0',
            currentPrice: {
                timestamp: '0',
                safetyPrice: '0',
                liquidationPrice: '0',
                value: '0'
            }
        },
        saviour: safe.saviour || { allowed: false, id: '' },
        cRatio: safe.cRatio || '0'
    };
}

// Helper function to create a default vault
function createDefaultVault(): QueriedVault {
    return {
        safeId: '0',
        collateral: '0',
        debt: '0',
        cRatio: '0', // Required by QuerySafe
        totalDebt: '0',
        collateralRatio: Infinity.toString(),
        collateralToken: 'UNKNOWN',
        status: Status.UNKNOWN,
        liquidationData: createDefaultLiquidationData(),
        liquidationPrice: '0',
        activity: [],
        owner: { address: '' },
        createdAt: '0',
        collateralType: {
            id: '',
            safetyCRatio: '0',
            liquidationCRatio: '0',
            currentPrice: {
                timestamp: '0',
                safetyPrice: '0',
                liquidationPrice: '0',
                value: '0'
            }
        },
        saviour: { allowed: false, id: '' },
    };
}

// Helper function to create default liquidation data
function createDefaultLiquidationData(): CollateralLiquidationData {
    return {
        liquidationCRatio: '0',
        safetyCRatio: '0',
        accumulatedRate: '1',
        currentPrice: {
            liquidationPrice: '0',
            safetyPrice: '0',
            value: '0'
        },
        debtFloor: '0',
        liquidationPenalty: '0',
        totalAnnualizedStabilityFee: '0'
    };
}
