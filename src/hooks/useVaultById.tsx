import { useMemo } from 'react'
import { useQuery } from '@apollo/client'

import { SAFE_QUERY, type QueryConfiscateSAFECollateralAndDebt, type QuerySafe, formatQuerySafeToVault } from '~/utils'
import { useStoreState } from '~/store'

export function useVaultById(id: string) {
    const { vaultModel: vaultState } = useStoreState((state) => state)

    const { data, loading, error, refetch } = useQuery<{
        safes: QuerySafe[]
        modifySAFECollateralizations: {
            id: string
            deltaDebt: string
            deltaCollateral: string
            createdAt: string
            createdAtTransaction: string
            accumulatedRate: string
            safe: { safeId: string }
        }[]
        confiscateSAFECollateralAndDebts: QueryConfiscateSAFECollateralAndDebt[]
    }>(SAFE_QUERY, {
        variables: { id },
        skip: !id,
    })

    const vault = useMemo(() => {
        if (!data?.safes[0] || !vaultState.liquidationData) return undefined

        const dataSafe = data.safes[0]
        
        // Extract the modification activity data
        const modifyActivity = data.modifySAFECollateralizations || []
        
        return formatQuerySafeToVault(
            dataSafe,
            vaultState.liquidationData.collateralLiquidationData,
            vaultState.liquidationData.currentRedemptionPrice,
            data.confiscateSAFECollateralAndDebts,
            modifyActivity
        )
    }, [data, vaultState])

    return {
        vault,
        loading,
        error,
        refetch,
    }
}
