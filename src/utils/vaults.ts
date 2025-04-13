import numeral from 'numeral'
import { type TokenData, utils as gebUtils } from '@parisii-inc/parys-sdk'
import { BigNumber } from 'ethers'

import type { CollateralLiquidationData, ILiquidationData, IVault, IVaultData } from '~/types'
import { Status } from './constants'
import { formatNumber, toFixedString } from './formatting'
import { returnTotalValue } from './math'
import { QueryConfiscateSAFECollateralAndDebt, QueryModifySAFECollateralization, type QuerySafe } from './graphql'
import { tokenAssets } from './tokens'

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
    [VaultInfoError.INSUFFICIENT_PARYS]: `Insufficient $PARYS balance`,
    [VaultInfoError.WITHDRAW_EXCEEDS_COLLATERAL]: `Withdraw amount cannot exceed collateral balance`,
    [VaultInfoError.REPAY_EXCEEDS_OWED]: `Repay amount cannot exceed $PARYS debt balance`,
    [VaultInfoError.ZERO_AMOUNT]: `Please enter a non-zero amount of collateral and/or $PARYS`,
    [VaultInfoError.GLOBAL_DEBT_CEILING]: `Cannot exceed global debt ceiling`,
    [VaultInfoError.PARYS_DEBT_CEILING]: `Cannot exceed PARYS debt ceiling`,
    [VaultInfoError.MINIMUM_MINT]: `You must mint at least 1 $PARYS to create a Vault`,
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
    if (Number(totalCollateral) === 0) {
        return '0'
    } else if (Number(totalDebt) === 0) {
        return '∞'
    }
    const denominator = numeral(totalDebt).value()

    const numerator = numeral(totalCollateral).multiply(liquidationPrice).multiply(liquidationCRatio)

    const value = numerator.divide(denominator).multiply(100)

    return formatNumber(value.value().toString(), 2, true)
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
    confiscateSAFECollateralAndDebts: QueryConfiscateSAFECollateralAndDebt[] = []
): QueriedVault => {
    // Check if safe has necessary properties
    if (!safe || !safe.collateralType) {
        console.error('Invalid safe data in formatQuerySafeToVault:', safe);
        // Return a safe default object
        return {
            ...safe,
            totalDebt: '0',
            collateralRatio: Infinity.toString(),
            collateralToken: 'UNKNOWN',
            status: Status.UNKNOWN,
            liquidationData: {
                liquidationCRatio: '0',
                safetyCRatio: '0',
                accumulatedRate: '1',
                currentPrice: '0',
                debtCeiling: '0',
                debtFloor: '0'
            },
            liquidationPrice: '0',
            activity: [],
        };
    }

    const collateralTypeId = safe.collateralType?.id || '';
    const collateralToken =
        Object.values(tokenAssets).find(
            ({ name, symbol }) => collateralTypeId === name || collateralTypeId === symbol
        )?.symbol || collateralTypeId.toUpperCase();

    // Check if collateralLiquidationData has the collateralToken
    if (!collateralLiquidationData || !collateralLiquidationData[collateralToken]) {
        console.error('Missing collateralLiquidationData for token:', collateralToken);
        return {
            ...safe,
            totalDebt: safe.debt || '0',
            collateralRatio: Infinity.toString(),
            collateralToken,
            status: Status.UNKNOWN,
            liquidationData: {
                liquidationCRatio: '0',
                safetyCRatio: '0',
                accumulatedRate: '1',
                currentPrice: '0',
                debtCeiling: '0',
                debtFloor: '0'
            },
            liquidationPrice: '0',
            activity: [],
        };
    }

    // Safety check for accumulated rate
    const accumulatedRate = collateralLiquidationData[collateralToken]?.accumulatedRate || '1';
    
    const totalDebt = returnTotalDebt(safe.debt || '0', accumulatedRate) as string;
    
    // Safety check for liquidation price
    const liquidationPrice = safe.collateralType?.currentPrice?.liquidationPrice || '0';
    const liquidationCRatio = safe.collateralType?.liquidationCRatio || '1';
    
    const collateralRatio =
        !safe.debt || safe.debt === '0'
            ? Infinity.toString()
            : getCollateralRatio(
                  safe.collateral || '0',
                  totalDebt,
                  liquidationPrice,
                  liquidationCRatio
              );
    
    // Safety check for safety ratio
    const safetyCRatio = safe.collateralType?.safetyCRatio || '0';
    
    const status =
        riskStateToStatus[ratioChecker(parseFloat(collateralRatio), parseFloat(safetyCRatio))];
    
    const liquidationPriceValue = getLiquidationPrice(
        safe.collateral || '0',
        totalDebt,
        collateralLiquidationData[collateralToken]?.liquidationCRatio || '0',
        currentRedemptionPrice || '1'
    );
    
    return {
        ...safe,
        totalDebt,
        collateralRatio,
        collateralToken,
        status,
        liquidationData: collateralLiquidationData[collateralToken],
        liquidationPrice: liquidationPriceValue,
        activity: [
            ...(safe.modifySAFECollateralization || []),
            ...confiscateSAFECollateralAndDebts.map((obj) => ({ ...obj, type: 'confiscate' })),
        ].sort(({ createdAt: a }, { createdAt: b }) => parseInt(b) - parseInt(a)) as any,
    };
}
