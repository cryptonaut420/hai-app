import { useCallback, useMemo } from 'react'
import { type TransactionResponse, type TransactionRequest } from '@ethersproject/providers'
import { JsonRpcSigner } from '@ethersproject/providers/lib/json-rpc-provider'
import { utils as gebUtils } from '@parisii-inc/parys-sdk'
import { BigNumber } from 'ethers'
import { useAccount, useNetwork } from 'wagmi'

import type { ITransaction } from '~/types'
import { ActionState, newTransactionsFirst } from '~/utils'
import { store, useStoreDispatch, useStoreState } from '~/store'

type TransactionAdder = (
    response: TransactionResponse,
    summary?: string,
    approval?: {
        tokenAddress: string
        spender: string
    }
) => void

// adding transaction to store
export function useTransactionAdder(): TransactionAdder {
    const { chain } = useNetwork()
    const { address: account } = useAccount()
    const { transactionsModel: transactionsDispatch } = useStoreDispatch()

    return useCallback(
        (
            response: TransactionResponse,
            summary?: string,
            approval?: {
                tokenAddress: string
                spender: string
            }
        ) => {
            if (!account) return
            if (!chain?.id) return

            if (!response.hash) {
                throw Error('No transaction hash found.')
            }

            const tx: ITransaction = {
                chainId: chain.id,
                hash: response.hash,
                from: account,
                summary,
                addedTime: new Date().getTime(),
                originalTx: response,
                approval,
            }

            transactionsDispatch.addTransaction(tx)
        },
        [chain?.id, account, transactionsDispatch]
    )
}

// add 20%
export function calculateGasMargin(value: BigNumber): BigNumber {
    return value.mul(BigNumber.from(10_000 + 2_000)).div(BigNumber.from(10_000))
}

export function isTransactionRecent(tx: ITransaction): boolean {
    return new Date().getTime() - tx.addedTime < 86_400_000
}

export function useIsTransactionPending(transactionHash?: string): boolean {
    const { transactions } = useStoreState(({ transactionsModel }) => transactionsModel)

    if (!transactionHash || !transactions[transactionHash]) return false

    return !transactions[transactionHash].receipt
}

// handking transactions gas limit as well as error messages

export async function handlePreTxGasEstimate(
    signer: JsonRpcSigner,
    tx: TransactionRequest,
    floorGasLimit?: string | null
): Promise<TransactionRequest> {
    let gasLimit: BigNumber
    try {
        console.log('handlePreTxGasEstimate: Estimating gas for transaction', {
            to: tx.to,
            from: tx.from,
            data: typeof tx.data === 'string' ? tx.data.substring(0, 50) + '...' : tx.data,
            value: tx.value?.toString()
        })
        gasLimit = await signer.estimateGas(tx)
        console.log('handlePreTxGasEstimate: Gas estimation successful', { gasLimit: gasLimit.toString() })
    } catch (err: any) {
        console.error('handlePreTxGasEstimate: Gas estimation failed', err)
        console.error('handlePreTxGasEstimate: Transaction details', {
            to: tx.to,
            from: tx.from || await signer.getAddress(),
            data: tx.data,
            value: tx.value?.toString()
        })
        
        let gebError: string | null = null
        try {
            console.log('handlePreTxGasEstimate: Attempting to call transaction to get more error details')
            const res = await signer.call(tx)
            gebError = gebUtils.getRequireString(res)
            console.log('handlePreTxGasEstimate: Call result', { res, gebError })
        } catch (callErr: any) {
            console.error('handlePreTxGasEstimate: Call also failed', callErr)
            // Try to extract error data from the error object
            if (callErr.error && callErr.error.data) {
                console.error('handlePreTxGasEstimate: Error data from call', callErr.error.data)
            }
            
            gebError = gebUtils.getRequireString(callErr)
            console.log('handlePreTxGasEstimate: Extracted error from call failure', { gebError })
        }

        let errorMessage: string
        if (gebError) {
            errorMessage = 'Geb error: ' + gebError
            console.error('handlePreTxGasEstimate: Geb error detected', { gebError })
        } else {
            errorMessage = 'Provider error: ' + (err?.message || err)
            console.error('handlePreTxGasEstimate: Provider error detected', { 
                message: err?.message,
                code: err?.code,
                data: err?.data,
                error: err?.error
            })
            
            // Try to extract more information if available
            if (err.error && err.error.data) {
                console.error('handlePreTxGasEstimate: Error data from estimation', err.error.data)
            }
        }
        store.dispatch.popupsModel.setIsWaitingModalOpen(true)
        store.dispatch.popupsModel.setWaitingPayload({
            title: 'Transaction Failed.',
            status: ActionState.ERROR,
        })
        console.error(errorMessage)
        throw errorMessage
    }

    // Add 20% slack in the gas limit
    const gasPlus20Percent = gasLimit.mul(120).div(100)
    console.log('handlePreTxGasEstimate: Added 20% to gas limit', { 
        original: gasLimit.toString(), 
        with20Percent: gasPlus20Percent.toString() 
    })

    if (floorGasLimit) {
        const floorGasLimitBN = BigNumber.from(floorGasLimit)
        tx.gasLimit = floorGasLimitBN.gt(gasPlus20Percent) ? floorGasLimitBN : gasPlus20Percent
        console.log('handlePreTxGasEstimate: Applied floor gas limit', { 
            floor: floorGasLimit,
            final: tx.gasLimit.toString() 
        })
    } else {
        tx.gasLimit = gasPlus20Percent
        console.log('handlePreTxGasEstimate: Using calculated gas limit', { 
            gasLimit: tx.gasLimit.toString() 
        })
    }

    return tx
}

export function handleTransactionError(e: any) {
    const { popupsModel: popupsDispatch } = store.dispatch

    console.error('handleTransactionError: Error details', {
        error: e,
        message: e?.message,
        code: e?.code,
        data: e?.data,
        reason: e?.reason
    })

    // Try to extract more detailed error information
    if (e?.error) {
        console.error('handleTransactionError: Inner error details', {
            innerError: e.error,
            message: e.error?.message,
            code: e.error?.code,
            data: e.error?.data
        })
    }

    if (typeof e === 'string' && (e.toLowerCase().includes('join') || e.toLowerCase().includes('exit'))) {
        popupsDispatch.setWaitingPayload({
            title: 'Cannot join/exit at this time.',
            status: ActionState.ERROR,
        })
        return
    }
    if (e?.code === 4001) {
        popupsDispatch.setWaitingPayload({
            title: 'Transaction Rejected.',
            status: ActionState.ERROR,
        })
        return
    }
    popupsDispatch.setWaitingPayload({
        title: 'Transaction Failed.',
        status: ActionState.ERROR,
    })
    console.error(`Transaction failed`, e)
    
    // Log more details about the require string
    const requireString = gebUtils.getRequireString(e)
    console.log('Required String', requireString)
    
    // If error data contains a hex string, try to decode it
    if (e?.data && typeof e.data === 'string' && e.data.startsWith('0x')) {
        console.log('Transaction error data hex:', e.data)
        // The hex string might be an error code or a revert reason
        console.log('This might be a contract revert code')
    }
}

export function useHasPendingTransactions() {
    const { transactions: allTransactions } = useStoreState(({ transactionsModel }) => transactionsModel)

    const sortedRecentTransactions = useMemo(() => {
        const txs = Object.values(allTransactions)
        return txs.filter(isTransactionRecent).sort(newTransactionsFirst)
    }, [allTransactions])

    return useMemo(() => {
        const pending = sortedRecentTransactions.filter((tx) => !tx.receipt)
        // .map((tx) => tx.hash)
        return !!pending.length
    }, [sortedRecentTransactions])
}
