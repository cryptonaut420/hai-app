import { JsonRpcSigner } from '@ethersproject/providers/lib/json-rpc-provider'
import { Geb, getTokenList } from '@parisii-inc/parys-sdk'
import { BigNumber, ethers } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { TransactionRequest as EthersTransactionRequest } from '@ethersproject/abstract-provider'
import { BytesLike, hexlify } from '@ethersproject/bytes'

import type { IVaultData, IVault } from '~/types/vaults'
import { getNetworkName } from '~/utils/constants'
import { handlePreTxGasEstimate } from '~/hooks'
import { TransactionResponse } from '@ethersproject/providers'

// Constants for precision handling
const RAY = ethers.BigNumber.from(10).pow(27); // 10^27 (Ray precision)
const WAD = ethers.BigNumber.from(10).pow(18); // 10^18 (Wad precision)
const RAD = ethers.BigNumber.from(10).pow(45); // 10^45 (Rad precision)

// Minimum debt requirement for most collateral types (1 PARYS)
const MIN_DEBT_AMOUNT = ethers.utils.parseEther('1');

// Type definition for transaction requests
type TransactionRequest = {
    to?: string;
    from?: string;
    data?: string;
    value?: ethers.BigNumber;
    gasLimit?: ethers.BigNumber;
};

const abi = ['function drop() public view returns ()']

export const claimAirdrop = async (signer: JsonRpcSigner) => {
    if (!signer) return

    let airdropContract: ethers.Contract
    const chainId = await signer.getChainId()

    switch (chainId) {
        case 420: // op goerli
            airdropContract = new ethers.Contract('0xC20D579004ae4AB1481f936230E4029d6D677B5d', abi, signer)
            break
        case 11155420: // op sepolia
            airdropContract = new ethers.Contract('0x9BE7A6020e23077CEAF27B5EEeaAF054EF172812', abi, signer)
            break
    }

    const txData = await airdropContract!.populateTransaction.drop()

    const tx = await handlePreTxGasEstimate(signer, txData)

    const txResponse = await signer.sendTransaction(tx)

    return txResponse
}

export const claimAirdropVelo = async (signer: JsonRpcSigner) => {
    if (!signer) return

    let airdropContract: ethers.Contract
    const chainId = await signer.getChainId()

    switch (chainId) {
        case 420: // op goerli
            airdropContract = new ethers.Contract('0x8211298C7f8cdb4DF48B9E6B5F6C2059c975BBFD', abi, signer)
            break
        case 11155420: // op sepolia
            airdropContract = new ethers.Contract('0x8211298C7f8cdb4DF48B9E6B5F6C2059c975BBFD', abi, signer)
            break
    }

    const txData = await airdropContract!.populateTransaction.drop()

    const tx = await handlePreTxGasEstimate(signer, txData)

    const txResponse = await signer.sendTransaction(tx)

    return txResponse
}

export const liquidateVault = async (geb: any, vaultId: string) => {
    // Only a signer will be able to execute the tx. Not a provider.
    const signerIsValid = geb.signer && ethers.providers.JsonRpcSigner.isSigner(geb.signer)
    if (!signerIsValid) return

    const signer = geb.signer as JsonRpcSigner

    const txData = await geb.liquidations.liquidateSAFE(vaultId)

    const tx = await handlePreTxGasEstimate(signer, txData)

    const txResponse = await signer.sendTransaction(tx)

    return txResponse
}

export const handleClaimFreeCollateral = async (signer: JsonRpcSigner, vault: IVault) => {
    const freeCollateralBN = parseEther(vault.freeCollateral || '0')
    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    const geb = new Geb(networkName, signer)
    
    // Get the bytes32 representation of the collateral from the token list
    const tokenList = getTokenList(networkName)
    const collateralBytes32 = tokenList[vault.collateralName]?.bytes32String
    
    if (!collateralBytes32) {
        throw new Error(`Collateral type ${vault.collateralName} not found in token list`)
    }
    
    const proxy = await geb.getProxyAction(signer._address)
    let txData: EthersTransactionRequest = {}
    txData = await proxy.collectTokenCollateral(collateralBytes32, vault.id, freeCollateralBN)
    const txResponse = await signer.sendTransaction(txData)
    return txResponse
}

export const handleDepositAndBorrow = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId = '') => {
    if (!signer || !vaultData) {
        return false
    }

    console.log('handleDepositAndBorrow raw input params:', {
        deposit: vaultData.deposit, 
        borrow: vaultData.borrow,
        vaultId
    })

    // Ensure deposit and borrow values are strings and non-empty
    const depositStr = vaultData.deposit ? vaultData.deposit.toString() : '0'
    const borrowStr = vaultData.borrow ? vaultData.borrow.toString() : '0'
    
    console.log('Parsed string values:', { depositStr, borrowStr })

    const collateralBN = parseEther(depositStr)
    const debtBN = parseEther(borrowStr)

    console.log('Parsed BigNumber values:', {
        collateralBN: collateralBN.toString(),
        debtBN: debtBN.toString()
    })

    // Validate that we have non-zero values
    if (collateralBN.isZero() && debtBN.isZero()) {
        throw new Error('Cannot proceed with zero collateral and zero debt')
    }

    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    console.log('Network info:', { chainId, networkName })

    const geb = new Geb(networkName, signer)
    
    // Try to verify if the vault exists and if the user has access to it
    try {
        console.log('Trying to get proxy action for the signer...')
        // Get the proxy action
        const proxyAction = await geb.getProxyAction(signer._address)
        if (proxyAction && proxyAction.proxyAddress) {
            console.log('Found proxy address:', proxyAction.proxyAddress)
        } else {
            console.error('No proxy found for this user - this may cause transactions to fail')
        }
        
        // Log vault info if we have a vault ID
        if (vaultId) {
            console.log(`Working with vault ID ${vaultId} - please verify ownership`)
        }
    } catch (e) {
        console.error('Error checking user proxy:', e)
    }
    
    // Log the token list to see all available tokens
    const tokenList = getTokenList(networkName)
    console.log('Available tokens:', Object.keys(tokenList))
    
    // Normalize the token name for matching - try uppercase, lowercase, and as-is
    const tokenName = vaultData.collateral
    const tokenNameUpper = tokenName.toUpperCase()
    const tokenNameLower = tokenName.toLowerCase()
    
    let matchedToken = null
    
    // Try matching with different case variations
    if (tokenList[tokenName]) {
        matchedToken = tokenName
    } else if (tokenList[tokenNameUpper]) {
        matchedToken = tokenNameUpper
    } else if (tokenList[tokenNameLower]) {
        matchedToken = tokenNameLower
    }
    
    // Check all keys in case there's a different naming convention
    if (!matchedToken) {
        for (const key of Object.keys(tokenList)) {
            if (key.toUpperCase() === tokenNameUpper) {
                matchedToken = key
                break
            }
        }
    }
    
    if (!matchedToken) {
        console.error(`Token ${tokenName} not found in token list. Available tokens:`, Object.keys(tokenList))
        throw new Error(`Token ${tokenName} not found in token list`)
    }
    
    console.log(`Found matching token: ${matchedToken} for input: ${tokenName}`)
    
    // Use the matched token name for all operations
    const tokenData = tokenList[matchedToken]
    console.log('Token details:', tokenData)

    const proxy = await geb.getProxyAction(signer._address)

    let txData: TransactionRequest = {}

    if (vaultId) {
        console.log('Modifying existing vault:', vaultId)
        
        if (collateralBN.isZero() && !debtBN.isZero()) {
            console.log('Generating debt only:', debtBN.toString())
            txData = await proxy.generateDebt(vaultId, debtBN)
        } else if (!collateralBN.isZero() && debtBN.isZero()) {
            console.log('Locking collateral only:', collateralBN.toString())
            txData = await proxy.lockTokenCollateral(matchedToken, vaultId, collateralBN)
        } else {
            console.log('Locking collateral and generating debt:')
            console.log('- collateral:', matchedToken)
            console.log('- vaultId:', vaultId)
            console.log('- collateralBN:', collateralBN.toString())
            console.log('- debtBN:', debtBN.toString())
            
            // Extra validation
            if (collateralBN.lte(0) || debtBN.lte(0)) {
                throw new Error(`Invalid values: collateral=${collateralBN.toString()}, debt=${debtBN.toString()}`)
            }
            
            // Try to log the contract state for debugging
            try {
                console.log('Contract integrations:')
                // This info is available from tokenData
                console.log('Collateral Join for', matchedToken, ':', tokenData.collateralJoin || '(not available)')
                
                // Check if collateral join is missing
                if (!tokenData.collateralJoin) {
                    console.error('Missing collateral join address - this will cause the transaction to fail')
                }
            } catch (e) {
                console.error('Error accessing contract data:', e)
            }
            
            txData = await proxy.lockTokenCollateralAndGenerateDebt(matchedToken, vaultId, collateralBN, debtBN)
        }
    } else {
        console.log('Creating new vault with:')
        console.log('- collateral:', matchedToken)
        console.log('- collateralBN:', collateralBN.toString())
        console.log('- debtBN:', debtBN.toString())
        
        // Extra validation
        if (collateralBN.lte(0) || debtBN.lte(0)) {
            throw new Error(`Invalid values: collateral=${collateralBN.toString()}, debt=${debtBN.toString()}`)
        }
        
        txData = await proxy.openLockTokenCollateralAndGenerateDebt(matchedToken, collateralBN, debtBN)
    }

    if (!txData) throw new Error('No transaction request!')

    console.log('txData:', txData)
    
    // Inspect the transaction data to make sure it has the expected format
    if (typeof txData.data === 'string') {
        console.log('Transaction data length:', txData.data.length)
        
        // Try to decode the transaction data for better debugging
        try {
            // The first 10 characters (including 0x) are the function selector
            const functionSelector = txData.data.substring(0, 10)
            console.log('Function selector:', functionSelector)
            
            // Check if it's a proxy execution (execute function selector)
            if (functionSelector === '0x1cff79cd') {
                console.log('This is a proxy execution (execute function)')
                
                // The proxy target address is the first parameter (next 32 bytes after selector)
                const targetAddress = '0x' + txData.data.substring(10, 74).replace(/^0+/, '')
                console.log('Target address for proxy execution:', targetAddress)
                
                // The actual function data starts at offset in the second parameter
                // This is more complex to decode, but we can at least log it
                console.log('Function data for inner call (hex):', txData.data.substring(74))
            }
        } catch (e) {
            console.error('Error decoding transaction data:', e)
        }
        
        // Check if the data ends with a bunch of zeros, which might indicate empty parameters
        const lastPart = txData.data.slice(-64)
        console.log('Last part of transaction data:', lastPart)
        
        if (lastPart === '0000000000000000000000000000000000000000000000000000000000000000') {
            console.warn('Warning: Transaction data ends with zeros, this might indicate empty parameters')
        }
    }
    
    console.log('HANDLING PRE TX GAS ESTIMATE')

    const tx = await handlePreTxGasEstimate(signer, txData, vaultId ? null : '865000')

    const txResponse = await signer.sendTransaction(tx)
    return txResponse
}

export const handleDepositAndRepay = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId = '') => {
    if (!signer || !vaultData) {
        return false
    }
    if (!vaultId) throw new Error('No vault Id')

    console.log('handleDepositAndRepay raw input params:', {
        deposit: vaultData.deposit,
        repay: vaultData.repay,
        vaultId
    })

    const totalDebtBN = parseEther(vaultData.totalDebt || '0')
    const collateralBN = parseEther(vaultData.deposit || '0')
    const haiToRepay = parseEther(vaultData.repay || '0')
    const shouldRepayAll =
        (totalDebtBN.isZero() && !haiToRepay.isZero()) || totalDebtBN.sub(haiToRepay).lt(parseEther('1'))

    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    const geb = new Geb(networkName, signer)

    const proxy = await geb.getProxyAction(signer._address)

    let txResponse1: TransactionResponse | undefined = undefined
    if (!collateralBN.isZero()) {
        const txData = await proxy.lockTokenCollateral(vaultData.collateral, vaultId, collateralBN)
        const tx1 = await handlePreTxGasEstimate(signer, txData, null)
        txResponse1 = await signer.sendTransaction(tx1)
    }

    let txResponse2: TransactionResponse | undefined = undefined
    if (!haiToRepay.isZero()) {
        const txData = shouldRepayAll ? await proxy.repayAllDebt(vaultId) : await proxy.repayDebt(vaultId, haiToRepay)
        const tx2 = await handlePreTxGasEstimate(signer, txData, null)
        txResponse2 = await signer.sendTransaction(tx2)
    }

    return [txResponse1, txResponse2]
}


export const handleRepayAndWithdraw = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId: string) => {
    if (!signer || !vaultData) {
        return false
    }
    if (!vaultId) throw new Error('No vault Id')

    console.log('handleRepayAndWithdraw raw input params:', {
        withdraw: vaultData.withdraw,
        repay: vaultData.repay,
        vaultId
    })

    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    const geb = new Geb(networkName, signer)

    const totalDebtBN = parseEther(vaultData.totalDebt || '0')
    // const totalCollateralBN = parseEther(vaultData.totalCollateral || '0')
    const collateralToFree = parseEther(vaultData.withdraw || '0')
    const haiToRepay = parseEther(vaultData.repay || '0')
    const proxy = await geb.getProxyAction(signer._address)

    const shouldRepayAll =
        (totalDebtBN.isZero() && !haiToRepay.isZero()) || totalDebtBN.sub(haiToRepay).lt(parseEther('1'))

    let txData: TransactionRequest = {}

    if (!collateralToFree.isZero() && shouldRepayAll) {
        txData = await proxy.repayAllDebtAndFreeTokenCollateral(vaultData.collateral, vaultId, collateralToFree)
    } else if (collateralToFree.isZero() && shouldRepayAll) {
        txData = await proxy.repayAllDebt(vaultId)
    } else if (collateralToFree.isZero() && !haiToRepay.isZero()) {
        txData = await proxy.repayDebt(vaultId, haiToRepay)
    } else if (!collateralToFree.isZero() && haiToRepay.isZero()) {
        txData = await proxy.freeTokenCollateral(vaultData.collateral, vaultId, collateralToFree)
    } else {
        txData = await proxy.repayDebtAndFreeTokenCollateral(
            vaultData.collateral,
            vaultId,
            collateralToFree,
            haiToRepay
        )
    }

    if (!txData) throw new Error('No transaction request!')

    if (vaultData.isGnosisSafe && !collateralToFree.isZero()) {
        txData.gasLimit = BigNumber.from('865000')
    }
    const tx =
        vaultData.isGnosisSafe && !collateralToFree.isZero() ? txData : await handlePreTxGasEstimate(signer, txData)

    const txResponse = await signer.sendTransaction(tx)
    return txResponse
}

export const handleWithdrawAndBorrow = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId: string) => {
    if (!signer || !vaultData) {
        return false
    }
    if (!vaultId) throw new Error('No vault Id')

    console.log('handleWithdrawAndBorrow raw input params:', {
        withdraw: vaultData.withdraw,
        borrow: vaultData.borrow,
        vaultId
    })

    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    const geb = new Geb(networkName, signer)

    const collateralToFree = parseEther(vaultData.withdraw || '0')
    const debtBN = parseEther(vaultData.borrow || '0')
    const proxy = await geb.getProxyAction(signer._address)

    let txResponse1: TransactionResponse | undefined = undefined
    if (!collateralToFree.isZero()) {
        const txData = await proxy.freeTokenCollateral(vaultData.collateral, vaultId, collateralToFree)
        const tx1 = await handlePreTxGasEstimate(signer, txData, null)
        txResponse1 = await signer.sendTransaction(tx1)
    }

    let txResponse2: TransactionResponse | undefined = undefined
    if (!debtBN.isZero()) {
        const txData = await proxy.generateDebt(vaultId, debtBN)
        const tx2 = await handlePreTxGasEstimate(signer, txData, null)
        txResponse2 = await signer.sendTransaction(tx2)
    }

    return [txResponse1, txResponse2]
}

export class Blockchain {
    geb: any
    constructor(geb: any) {
        this.geb = geb
    }
}

