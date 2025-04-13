import { useMemo, useState } from 'react'
import { useQuery } from '@apollo/client'

import type { SortableHeader, Sorting } from '~/types'
import {
    ALLSAFES_QUERY_NOT_ZERO,
    ALLSAFES_QUERY_WITH_ZERO,
    type QuerySafe,
    arrayToSorted,
    formatQuerySafeToVault,
    Status
} from '~/utils'
import { useStoreState } from '~/store'

import { type FlexProps } from '~/styles'

const sortableHeaders: (SortableHeader & FlexProps)[] = [
    { label: 'Vault' },
    { label: 'Owner' },
    { label: 'Collateral' },
    { label: 'Debt' },
    { label: 'Collateral Ratio' },
    {
        label: '',
        unsortable: true,
    },
]

const MAX_VAULTS_TO_FETCH = 500

type OrderBy = 'collateral' | 'cRatio' | 'debt'
export function useAllVaults() {
    const { vaultModel: vaultState } = useStoreState((state) => state)

    const [filterEmpty, setFilterEmpty] = useState(false)
    const [collateralFilter, setCollateralFilter] = useState<string>()

    const [sorting, setSorting] = useState<Sorting>({
        key: 'Collateral Ratio',
        dir: 'asc',
    })

    const orderBy: OrderBy = useMemo(() => {
        switch (sorting.key) {
            case 'Collateral':
                return 'collateral'
            case 'Debt':
                return 'debt'
            default:
                return 'cRatio'
        }
    }, [sorting.key])

    // Log the query being used for debugging
    console.log('Query used:', filterEmpty ? 'ALLSAFES_QUERY_NOT_ZERO' : 'ALLSAFES_QUERY_WITH_ZERO');
    console.log('Query variables:', {
        first: MAX_VAULTS_TO_FETCH,
        skip: 0,
        orderBy,
        orderDirection: sorting.dir,
    });

    const { data, error, loading, refetch } = useQuery<{ safes: QuerySafe[] }>(
        filterEmpty ? ALLSAFES_QUERY_NOT_ZERO : ALLSAFES_QUERY_WITH_ZERO,
        {
            variables: {
                first: MAX_VAULTS_TO_FETCH,
                skip: 0,
                orderBy,
                orderDirection: sorting.dir,
            },
            onCompleted: (data) => {
                console.log('Apollo query completed:', { 
                    safesCount: data?.safes?.length || 0,
                    firstFewSafes: data?.safes?.slice(0, 3) || []
                });
            },
            onError: (error) => {
                console.error('Apollo query error:', { 
                    message: error.message,
                    graphQLErrors: error.graphQLErrors,
                    networkError: error.networkError,
                    stack: error.stack
                });
            }
        }
    )

    // Log data and error for debugging
    console.log('Apollo query state:', { loading, error: error?.message, dataExists: !!data });
    if (error) {
        console.error('Detailed error info:', {
            message: error.message,
            name: error.name,
            stack: error.stack,
            graphQLErrors: error.graphQLErrors,
            networkError: error.networkError,
            extraInfo: error.extraInfo
        });
    }

    const vaultsWithCRatioAndToken = useMemo(() => {
        const { collateralLiquidationData, currentRedemptionPrice } = vaultState.liquidationData || {}
        if (!data?.safes?.length) {
            console.log('No safes data available');
            return []
        }
        
        if (!collateralLiquidationData || !currentRedemptionPrice) {
            console.log('Missing liquidation data or redemption price');
            console.log('Vault state data:', { 
                hasLiquidationData: !!vaultState.liquidationData,
                hasCollateralLiquidationData: !!collateralLiquidationData,
                currentRedemptionPrice
            });
            return []
        }

        try {
            // Filter out duplicate safes - keep only the latest version of each safeId
            const latestSafes = new Map();
            
            data.safes.forEach(safe => {
                if (!safe || !safe.safeId) return;
                
                // If we don't have this safeId yet, or this version is newer
                if (!latestSafes.has(safe.safeId) || 
                    (safe.modifiedAt && latestSafes.get(safe.safeId).modifiedAt && 
                     parseInt(safe.modifiedAt) > parseInt(latestSafes.get(safe.safeId).modifiedAt))) {
                    latestSafes.set(safe.safeId, safe);
                }
            });
            
            // Convert Map to Array and filter out incomplete data
            return Array.from(latestSafes.values())
                .filter(safe => safe && safe.collateralType) // Filter out safes with incomplete data
                .map((safe) => {
                    try {
                        return formatQuerySafeToVault(safe, collateralLiquidationData, currentRedemptionPrice)
                    } catch (err) {
                        console.error('Error formatting safe:', safe, err)
                        // Return a placeholder vault with minimal data
                        return {
                            ...safe,
                            totalDebt: safe.debt || '0',
                            collateralRatio: Number(safe.debt) > 0 ? '0' : Infinity.toString(),
                            collateralToken: safe.collateralType?.id?.toUpperCase() || 'UNKNOWN',
                            status: Number(safe.debt) > 0 ? Status.UNKNOWN : Status.NO_DEBT,
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
                        }
                    }
                })
        } catch (err) {
            console.error('Error processing safes data:', err)
            return []
        }
    }, [data?.safes, vaultState.liquidationData])

    // Log computed values for debugging
    console.log('vaultsWithCRatioAndToken count:', vaultsWithCRatioAndToken.length);

    const sortedRows = useMemo(() => {
        switch (sorting.key) {
            case 'Vault':
                return arrayToSorted(vaultsWithCRatioAndToken, {
                    getProperty: (vault) => vault.safeId,
                    dir: sorting.dir,
                    type: 'parseInt',
                })
            case 'Owner':
                return arrayToSorted(vaultsWithCRatioAndToken, {
                    getProperty: (vault) => vault.owner.address,
                    dir: sorting.dir,
                    type: 'alphabetical',
                })
            case 'Collateral':
                return arrayToSorted(vaultsWithCRatioAndToken, {
                    getProperty: (vault) => vault.collateral,
                    dir: sorting.dir,
                    type: 'parseFloat',
                })
            case 'Debt':
                return arrayToSorted(vaultsWithCRatioAndToken, {
                    getProperty: (vault) => vault.debt,
                    dir: sorting.dir,
                    type: 'parseFloat',
                })
            case 'Collateral Ratio':
            default:
                return arrayToSorted(vaultsWithCRatioAndToken, {
                    getProperty: (vault) =>
                        vault.cRatio && vault.cRatio !== '0' ? vault.cRatio : vault.collateralRatio,
                    dir: sorting.dir,
                    type: 'parseFloat',
                })
        }
    }, [vaultsWithCRatioAndToken, sorting])

    const filteredAndSortedRows = useMemo(() => {
        if (!collateralFilter || collateralFilter === 'All') return sortedRows

        return sortedRows.filter(({ collateralToken }) => collateralFilter === collateralToken)
    }, [sortedRows, collateralFilter])

    console.log('Final rows count:', filteredAndSortedRows.length);

    return {
        error,
        loading,
        refetch,
        headers: sortableHeaders,
        rows: filteredAndSortedRows,
        rowsUnmodified: vaultsWithCRatioAndToken,
        sorting,
        setSorting,
        filterEmpty,
        setFilterEmpty,
        collateralFilter,
        setCollateralFilter,
    }
}
