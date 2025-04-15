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
        console.log('Attempting gas estimation for:', tx)
        gasLimit = await signer.estimateGas(tx)
    } catch (err: any) {
        let gebError: string | null = null
        let detailedError: string | null = null
        
        console.log('Gas estimation failed with error:', err)
        
        // Check for specific error codes
        if (err.error?.data) {
            console.log('Error data found:', err.error.data)
            
            // Common Ethereum error signatures
            const errorSignatures: {[key: string]: string} = {
                '0x08c379a0': 'Error(string)',
                '0x4e487b71': 'Panic(uint256)',
                '0xdba06d65': 'ProxyExecutionFailed'
            }
            
            // Extract the first 10 characters (0x + 8 chars) which is the function selector
            const errorSignature = err.error.data.substring(0, 10)
            console.log('Error signature:', errorSignature)
            
            if (errorSignatures[errorSignature]) {
                console.log('Known error type:', errorSignatures[errorSignature])
                
                // For standard error string
                if (errorSignature === '0x08c379a0') {
                    try {
                        // Import ethers here to avoid linter errors
                        const { ethers } = await import('ethers')
                        const bytes = ethers.utils.arrayify(err.error.data)
                        const decoded = ethers.utils.defaultAbiCoder.decode(['string'], bytes.slice(4))
                        detailedError = decoded[0]
                        console.log('Decoded error string:', detailedError)
                    } catch (e) {
                        console.log('Failed to decode error string:', e)
                    }
                }
                
                // If it's the proxy execution error we're seeing
                if (errorSignature === '0xdba06d65') {
                    detailedError = 'Proxy execution failed - the proxy contract could not execute the requested function'
                    console.log('Proxy execution failed. This often happens when contract requirements are not met.')
                    
                    // Try to get more specific data if available
                    if (err.error.data.length > 10) {
                        try {
                            // Import ethers here to avoid linter errors
                            const { ethers } = await import('ethers')
                            console.log('Attempting to decode inner error data')
                            
                            // The proxy might include the inner error after its own error code
                            const innerErrorData = '0x' + err.error.data.slice(10)
                            console.log('Inner error data:', innerErrorData)
                            
                            // Try to identify the inner error signature
                            const innerErrorSignature = innerErrorData.substring(0, 10)
                            console.log('Inner error signature:', innerErrorSignature)
                            
                            if (errorSignatures[innerErrorSignature] === 'Error(string)') {
                                const bytes = ethers.utils.arrayify(innerErrorData)
                                const decoded = ethers.utils.defaultAbiCoder.decode(['string'], bytes.slice(4))
                                detailedError += ': ' + decoded[0]
                                console.log('Decoded inner error string:', decoded[0])
                            }
                        } catch (e) {
                            console.log('Failed to decode inner error:', e)
                        }
                    }
                }
            }
        }

        // Try to get error from call method as a fallback
        if (!detailedError) {
            try {
                console.log('Attempting to call method to get more error details')
                const res = await signer.call(tx)
                gebError = gebUtils.getRequireString(res)
                console.log('GEB utils revealed error:', gebError)
            } catch (callErr: any) {
                console.log('Call method also failed with error:', callErr)
                gebError = gebUtils.getRequireString(callErr)
                
                // If still no detailed error, try to extract from call error
                if (!detailedError) {
                    if (callErr.error?.data) {
                        try {
                            // Import ethers here to avoid linter errors
                            const { ethers } = await import('ethers')
                            const bytes = ethers.utils.arrayify(callErr.error.data)
                            const decoded = ethers.utils.defaultAbiCoder.decode(['string'], bytes.slice(4))
                            detailedError = decoded[0]
                        } catch (e) {
                            // If we can't decode, try other error properties
                            detailedError = callErr.error.message || callErr.error.reason
                        }
                    }
                }
            }
        }

        let errorMessage: string
        if (gebError) {
            errorMessage = 'Geb error: ' + gebError
        } else if (detailedError) {
            errorMessage = 'Transaction error: ' + detailedError
        } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
            // Check common failure conditions
            if (err.error?.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds to execute transaction'
            } else if (err.error?.message?.includes('exceeds balance')) {
                errorMessage = 'Transaction amount exceeds available balance'
            } else {
                errorMessage = 'Transaction cannot be executed: ' + (err.error?.message || err.message || err)
            }
        } else {
            errorMessage = 'Provider error: ' + (err?.message || err)
        }

        store.dispatch.popupsModel.setIsWaitingModalOpen(true)
        store.dispatch.popupsModel.setWaitingPayload({
            title: `Transaction Failed: ${errorMessage}`,
            status: ActionState.ERROR,
        })
        console.error('Transaction estimation failed:', {
            error: err,
            gebError,
            detailedError,
            errorMessage
        })
        throw errorMessage
    }

    // Add 20% slack in the gas limit
    const gasPlus20Percent = gasLimit.mul(120).div(100)

    if (floorGasLimit) {
        const floorGasLimitBN = BigNumber.from(floorGasLimit)
        tx.gasLimit = floorGasLimitBN.gt(gasPlus20Percent) ? floorGasLimitBN : gasPlus20Percent
    } else {
        tx.gasLimit = gasPlus20Percent
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
