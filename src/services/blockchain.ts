import { JsonRpcSigner } from '@ethersproject/providers/lib/json-rpc-provider'
import { Geb } from '@parisii-inc/parys-sdk'
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
    const proxy = await geb.getProxyAction(signer._address)
    let txData: EthersTransactionRequest = {}
    txData = await proxy.collectTokenCollateral(vault.collateralName, vault.id, freeCollateralBN)
    const txResponse = await signer.sendTransaction(txData)
    return txResponse
}

export const handleDepositAndBorrow = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId = '') => {
    if (!signer || !vaultData) {
        console.error('handleDepositAndBorrow: Missing signer or vault data')
        return false
    }

    const collateralBN = parseEther(vaultData.deposit || '0')
    let debtBN = parseEther(vaultData.borrow || '0')

    // Get GEB instance
    const chainId = await signer.getChainId()
    const networkName = getNetworkName(chainId)
    const geb = new Geb(networkName, signer)
    const proxy = await geb.getProxyAction(signer._address)

    // Initialize with empty values
    let collateralJoinAddress = ''
    let collateralJoin = null
    let tokenAddress = ''
    const collateralType = ethers.utils.formatBytes32String(vaultData.collateral)
    
    console.log(`Looking for collateral join for ${vaultData.collateral} (${collateralType})`)
    
    try {
        // Try to get the collateral join from the factory
        const gebContracts = geb.contracts as any
        console.log('Geb contracts:', gebContracts);
        return;
        const collateralJoinFactory = gebContracts.collateralJoinFactory || 
                                     (gebContracts.proxyFactory && gebContracts.proxyFactory.collateralJoinFactory)
        
        if (collateralJoinFactory) {
            try {
                collateralJoinAddress = await collateralJoinFactory.collateralJoins(collateralType)
                console.log(`Found collateral join at address: ${collateralJoinAddress}`)
                
                if (collateralJoinAddress && collateralJoinAddress !== '0x0000000000000000000000000000000000000000') {
                    // Get the collateral join contract
                    collateralJoin = new ethers.Contract(
                        collateralJoinAddress,
                        ['function collateral() view returns (address)', 'function join(address, uint) external'],
                        signer
                    )
                    console.log(`Successfully created collateral join contract instance`)
                }
            } catch (factoryError) {
                console.error('Error accessing collateral join factory:', factoryError)
            }
        }
    } catch (error) {
        console.error('Error finding collateral join:', error)
    }
    
    if (!collateralJoin || !collateralJoinAddress) {
        console.error(`Failed to find collateral join for ${vaultData.collateral}`)
        throw new Error(`Collateral join not found for ${vaultData.collateral}. Check contract naming pattern.`)
    }

    // Get token address from collateral join
    try {
        tokenAddress = await collateralJoin.collateral()
        console.log(`Got token address from collateral join: ${tokenAddress}`)
    } catch (error) {
        console.error('Error getting token address from collateral join:', error)
    }
    
    // If we couldn't get the token address from the collateral join,
    // try to find it another way
    if (!tokenAddress) {
        try {
            const gebContracts = geb.contracts as any;
            if (geb.tokenList && geb.tokenList[vaultData.collateral]) {
                tokenAddress = geb.tokenList[vaultData.collateral].address
                console.log(`Got token address from token list: ${tokenAddress}`)
            } else if (vaultData.collateral === 'PEUA' && gebContracts.collateral) {
                tokenAddress = gebContracts.collateral.address
                console.log(`Using collateral address from contracts: ${tokenAddress}`)
            } else if (vaultData.collateral === 'ETH') {
                tokenAddress = geb.contracts.weth.address
                console.log(`Using WETH address: ${tokenAddress}`)
            }
        } catch (error) {
            console.error('Error getting token address from alternate sources:', error)
        }
    }
    
    if (!tokenAddress) {
        throw new Error(`Token address not found for ${vaultData.collateral}`)
    }
    
    console.log(`Using token address: ${tokenAddress}`)
    const token = geb.getErc20Contract(tokenAddress)
    const approveTx = await token.approve(collateralJoinAddress, collateralBN)
    console.log(`Approval transaction sent: ${approveTx.hash}`)
    await approveTx.wait()
    console.log('Approval transaction confirmed')

    // Add tax collection step before generating debt
    try {
        const safeManager = geb.contracts.safeManager
        const safeInfo = await safeManager.safeData(vaultId)
        const collateralTypeBytes32 = ethers.utils.formatBytes32String(vaultData.collateral)
        
        console.log('Updating tax collector data for collateral type:', vaultData.collateral)
        
        // Check if tax collector exists and is accessible
        const taxCollector = geb.contracts.taxCollector
        if (!taxCollector) {
            console.error('Tax collector not found - this is likely the cause of the error')
        } else {
            try {
                const taxTx = await taxCollector.taxSingle(collateralTypeBytes32)
                console.log('Tax update transaction sent:', taxTx.hash)
                await taxTx.wait()
                console.log('Tax update successful')
            } catch (taxErrorUnknown) {
                const taxError = taxErrorUnknown as Error;
                console.log('Tax update failed (this may be normal):', taxError.message)
                // Continue anyway - this sometimes fails but isn't fatal
            }
        }
    } catch (error) {
        console.error('Failed during tax collection setup:', error)
        // Continue with transaction - don't throw here
    }

    // Check collateralization ratio
    try {
        console.log('====== STARTING COLLATERALIZATION CHECK ======');
        const safeEngine = geb.contracts.safeEngine
        const safeManager = geb.contracts.safeManager
        
        console.log('Getting safe data for vault ID:', vaultId);
        const safeInfo = await safeManager.safeData(vaultId)
        console.log('Received safe info:', { 
            owner: safeInfo.owner, 
            safeHandler: safeInfo.safeHandler
        });
        
        const safeHandler = safeInfo.safeHandler
        console.log('Collateral type (raw):', vaultData.collateral);
        const collateralTypeBytes32 = ethers.utils.formatBytes32String(vaultData.collateral)
        console.log('Collateral type (bytes32):', collateralTypeBytes32);
        
        // Get current collateral and debt
        console.log('Fetching current safe state from safeEngine...');
        let safeData;
        try {
            safeData = await safeEngine.safes(collateralTypeBytes32, safeHandler)
            console.log('Safe data retrieved successfully:', {
                lockedCollateral: safeData.lockedCollateral.toString(),
                generatedDebt: safeData.generatedDebt.toString()
            });
        } catch (error: unknown) {
            console.error('Error fetching safe data:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get safe data for handler ${safeHandler}: ${errorMsg}`);
        }
        
        console.log('Fetching collateral type data from safeEngine...');
        let cData;
        try {
            cData = await safeEngine.cData(collateralTypeBytes32)
            console.log('Collateral data retrieved:', {
                accumulatedRate: cData.accumulatedRate.toString(),
                safetyPrice: cData.safetyPrice.toString(),
                liquidationPrice: cData.liquidationPrice.toString()
            });
        } catch (error: unknown) {
            console.error('Error fetching collateral type data:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get collateral data for type ${vaultData.collateral}: ${errorMsg}`);
        }
        
        // Get the debt floor for this collateral type - use a more defensive approach
        let debtFloor = ethers.BigNumber.from('0');
        try {
            // Try to get debtFloor from the appropriate structure
            console.log('Attempting to get debt floor...');
            // Access debt floor through an indexed property access approach
            // since the exact structure might vary
            const debtFloorValue = (cData as any).debtFloor || 
                                  ((cData as any).params && (cData as any).params.debtFloor);
            
            if (debtFloorValue) {
                debtFloor = debtFloorValue;
                console.log('Got debt floor from cData:', debtFloor.toString());
            } else {
                // If not available in our object, try to query it directly
                console.log('Direct querying for debt floor...');
                const globalCData = await safeEngine.cData(collateralTypeBytes32);
                // Use type assertion to access potentially missing properties
                const globalDebtFloor = (globalCData as any).debtFloor;
                if (globalDebtFloor) {
                    debtFloor = globalDebtFloor;
                    console.log('Got debt floor from direct query:', debtFloor.toString());
                } else {
                    console.warn('No debt floor found in any expected location');
                }
            }
        } catch (err) {
            console.warn('Failed to get debt floor, using default:', err);
            // Use a safe default - most protocols have a minimum of around 1-10 units
            debtFloor = ethers.BigNumber.from('1000000000000000000'); // 1 unit in wei
            console.log('Using fallback debt floor:', debtFloor.toString());
        }
        console.log('Debt floor for this collateral type:', ethers.utils.formatEther(debtFloor));
        
        // Spot price is the safety price used for collateralization
        const spotPrice = cData.safetyPrice
        console.log('Safety price (spot price):', ethers.utils.formatUnits(spotPrice, 27));
        
        // Calculate current locked collateral plus new deposit
        const currentCollateral = ethers.BigNumber.from(safeData.lockedCollateral)
        console.log('Current locked collateral:', ethers.utils.formatEther(currentCollateral));
        console.log('New collateral to add:', ethers.utils.formatEther(collateralBN));
        
        const totalCollateral = collateralBN.add(currentCollateral)
        console.log('Total collateral after transaction:', ethers.utils.formatEther(totalCollateral));
        
        // Calculate safe debt ceiling
        const safeDebtCeiling = totalCollateral.mul(spotPrice).div(RAY)
        console.log('Calculated safe debt ceiling:', ethers.utils.formatEther(safeDebtCeiling));
        
        // Calculate total debt after this transaction
        const currentDebt = ethers.BigNumber.from(safeData.generatedDebt)
        console.log('Current generated debt:', ethers.utils.formatEther(currentDebt));
        console.log('New debt to generate:', ethers.utils.formatEther(debtBN));
        console.log('Accumulated rate:', ethers.utils.formatUnits(cData.accumulatedRate, 27));
        
        const totalDebt = debtBN.add(currentDebt).mul(cData.accumulatedRate).div(RAY)
        console.log('Total debt after transaction:', ethers.utils.formatEther(totalDebt));
        
        // Special handling for minimum debt requirements
        if (currentDebt.isZero() && !debtBN.isZero() && debtBN.lt(MIN_DEBT_AMOUNT)) {
            console.log('Adjusting debt amount to meet minimum debt requirement:');
            console.log(`  Original debt: ${ethers.utils.formatEther(debtBN)} PARYS`);
            console.log(`  Minimum required: ${ethers.utils.formatEther(MIN_DEBT_AMOUNT)} PARYS`);
            // If this is first debt minting, ensure it meets minimum debt requirement
            console.log(`Debt amount will be adjusted from ${ethers.utils.formatEther(debtBN)} to ${ethers.utils.formatEther(MIN_DEBT_AMOUNT)}`);
            // We're not actually modifying debtBN here, just logging, as we'll force it in the contract call
        }
        
        // Check if resulting debt would be too small (below dust/floor)
        if (!currentDebt.isZero() && !debtBN.isZero()) {
            const resultingDebt = currentDebt.add(debtBN)
            console.log('Resulting debt after this transaction:', ethers.utils.formatEther(resultingDebt));
            console.log('Debt floor divided by RAY:', ethers.utils.formatEther(debtFloor.div(RAY)));
            
            if (resultingDebt.lt(debtFloor.div(RAY))) {
                const minDebt = debtFloor.div(RAY).sub(currentDebt)
                console.warn(`Warning: Resulting debt would be below debt floor!`);
                console.warn(`  Resulting debt: ${ethers.utils.formatEther(resultingDebt)} PARYS`);
                console.warn(`  Debt floor: ${ethers.utils.formatEther(debtFloor.div(RAY))} PARYS`);
                console.warn(`  Minimum debt to add: ${ethers.utils.formatEther(minDebt)} PARYS`);
                throw new Error(`Cannot borrow less than ${ethers.utils.formatEther(minDebt)} PARYS - would be below debt floor`);
            } else {
                console.log('Debt is above the minimum required floor.');
            }
        }
        
        // Calculate collateralization ratio for logging
        let collateralRatio = 'N/A';
        if (totalCollateral.gt(0) && totalDebt.gt(0)) {
            collateralRatio = (safeDebtCeiling.mul(100).div(totalDebt)).toString() + '%';
        }
        
        console.log('Collateralization check complete:', {
            totalCollateral: ethers.utils.formatEther(totalCollateral),
            totalDebt: ethers.utils.formatEther(totalDebt),
            safeDebtCeiling: ethers.utils.formatEther(safeDebtCeiling),
            collateralRatio,
            currentDebt: ethers.utils.formatEther(currentDebt),
            debtFloor: ethers.utils.formatEther(debtFloor)
        });
        
        // Check if transaction would exceed safe debt ceiling
        if (totalDebt.gt(safeDebtCeiling)) {
            console.error('COLLATERALIZATION CHECK FAILED: Insufficient collateralization ratio');
            console.error(`Total debt (${ethers.utils.formatEther(totalDebt)}) exceeds safe debt ceiling (${ethers.utils.formatEther(safeDebtCeiling)})`);
            const requiredCollateral = totalDebt.mul(RAY).div(spotPrice);
            const additionalCollateralNeeded = requiredCollateral.sub(totalCollateral);
            console.error(`Additional collateral needed: ${ethers.utils.formatEther(additionalCollateralNeeded)}`);
            throw new Error('Transaction would exceed safe debt ceiling - insufficient collateralization ratio');
        } else {
            console.log('COLLATERALIZATION CHECK PASSED: Sufficient collateralization ratio');
        }
        
        console.log('====== COMPLETED COLLATERALIZATION CHECK ======');
    } catch (error: unknown) {
        console.error('====== COLLATERALIZATION CHECK FAILED ======');
        console.error('Error details:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        }
        // Only try to access code/data if error is an object
        if (error && typeof error === 'object') {
            const err = error as any;
            if (err.code) {
                console.error('Error code:', err.code);
            }
            if (err.data) {
                console.error('Error data:', err.data);
            }
        }
        throw error;
    }

    let txData: EthersTransactionRequest = {}

    try {
    if (vaultId) {
            console.log('handleDepositAndBorrow: Modifying existing vault', { vaultId })
        if (collateralBN.isZero() && !debtBN.isZero()) {
                console.log('handleDepositAndBorrow: Only borrowing PARYS, no collateral')
                // Make sure we meet minimum debt requirements for first borrow
                if (debtBN.lt(MIN_DEBT_AMOUNT)) {
                    console.log(`Forcing minimum debt amount from ${ethers.utils.formatEther(debtBN)} to ${ethers.utils.formatEther(MIN_DEBT_AMOUNT)}`)
                    debtBN = MIN_DEBT_AMOUNT
                }
            txData = await proxy.generateDebt(vaultId, debtBN)
        } else if (!collateralBN.isZero() && debtBN.isZero()) {
                console.log('handleDepositAndBorrow: Only adding collateral, no borrowing')
            txData = await proxy.lockTokenCollateral(vaultData.collateral, vaultId, collateralBN)
        } else {
                console.log('handleDepositAndBorrow: Both adding collateral and borrowing')
                // Force the minimum debt amount if this is a first borrow
                const safeEngine = geb.contracts.safeEngine
                const safeManager = geb.contracts.safeManager
                const safeInfo = await safeManager.safeData(vaultId)
                const safeHandler = safeInfo.safeHandler
                const collateralTypeBytes32 = ethers.utils.formatBytes32String(vaultData.collateral)
                const safeData = await safeEngine.safes(collateralTypeBytes32, safeHandler)
                const currentDebt = ethers.BigNumber.from(safeData.generatedDebt)
                
                if (currentDebt.isZero() && debtBN.lt(MIN_DEBT_AMOUNT)) {
                    console.log(`Forcing minimum debt amount from ${ethers.utils.formatEther(debtBN)} to ${ethers.utils.formatEther(MIN_DEBT_AMOUNT)}`)
                    debtBN = MIN_DEBT_AMOUNT
                }
                
                // Force minimum collateral requirement based on minimum collateralization ratio
            txData = await proxy.lockTokenCollateralAndGenerateDebt(vaultData.collateral, vaultId, collateralBN, debtBN)
                console.log('Transaction prepared with debt amount:', ethers.utils.formatEther(debtBN))
        }
    } else {
            console.log('handleDepositAndBorrow: Creating new vault')
        txData = await proxy.openLockTokenCollateralAndGenerateDebt(vaultData.collateral, collateralBN, debtBN)
    }

        console.log('====== TRANSACTION DETAILS ======');
        console.log('Target contract address:', txData.to);
        console.log('Transaction value:', txData.value?.toString() || '0');
        if (txData.data) {
            // Convert BytesLike to string if needed
            const dataStr = typeof txData.data === 'string' 
                ? txData.data 
                : ethers.utils.hexlify(txData.data);
                
            const funcSig = dataStr.slice(0, 10);
            console.log('Function signature:', funcSig);
            
            // For proxy calls (0x1cff79cd is the standard proxy execute function signature)
            if (funcSig === '0x1cff79cd') {
                // Parse the proxy call data
                const targetAddress = '0x' + dataStr.slice(34, 74);
                console.log('Proxy target address:', targetAddress);
                
                // Try to parse the internal function call
                const innerDataOffset = parseInt(dataStr.slice(74, 138), 16);
                const innerDataLength = parseInt(dataStr.slice(138, 202), 16) * 2;
                if (innerDataLength > 0) {
                    const innerData = '0x' + dataStr.slice(202, 202 + innerDataLength);
                    const innerFuncSig = innerData.slice(0, 10);
                    console.log('Inner function signature:', innerFuncSig);
                    console.log('Inner function data:', innerData);
                    
                    // For lockTokenCollateralAndGenerateDebt function (0x7f5b1a1b)
                    if (innerFuncSig === '0x7f5b1a1b') {
                        try {
                            // Parse function parameters
                            // Format: collateralType, safeId, collateralAmount, debtAmount
                            const params = ethers.utils.defaultAbiCoder.decode(
                                ['string', 'uint256', 'uint256', 'uint256'],
                                '0x' + innerData.slice(10)
                            );
                            console.log('Lock and Generate function parameters:');
                            console.log('  Collateral Type:', params[0]);
                            console.log('  Safe ID:', params[1].toString());
                            console.log('  Collateral Amount:', ethers.utils.formatEther(params[2]), 'ETH');
                            console.log('  Debt Amount:', ethers.utils.formatEther(params[3]), 'PARYS');
                        } catch (e) {
                            console.log('Could not parse inner function parameters:', e);
                        }
                    }
                }
            }
        }

        // Log the complete safe data to verify collateralization
        try {
            const safeEngine = geb.contracts.safeEngine;
            const safeManager = geb.contracts.safeManager;
            const safeInfo = await safeManager.safeData(vaultId);
            const safeHandler = safeInfo.safeHandler;
            const collateralTypeBytes32 = ethers.utils.formatBytes32String(vaultData.collateral);
            
            console.log('Safe ID:', vaultId);
            console.log('Safe Handler:', safeHandler);
            console.log('Collateral Type:', vaultData.collateral, '(bytes32:', collateralTypeBytes32, ')');
            
            // Get current collateral and debt
            const safeData = await safeEngine.safes(collateralTypeBytes32, safeHandler);
            console.log('Current safe state:');
            console.log('  Locked Collateral:', ethers.utils.formatEther(safeData.lockedCollateral));
            console.log('  Generated Debt:', ethers.utils.formatEther(safeData.generatedDebt));
            
            // Get collateral info
            const cData = await safeEngine.cData(collateralTypeBytes32);
            console.log('Collateral type parameters:');
            console.log('  Accumulated Rate:', ethers.utils.formatUnits(cData.accumulatedRate, 27));
            console.log('  Safety Price:', ethers.utils.formatUnits(cData.safetyPrice, 27));
            console.log('  Liquidation Price:', ethers.utils.formatUnits(cData.liquidationPrice, 27));
        } catch (debugError) {
            console.error('Debug logging error (non-fatal):', debugError);
        }

        console.log('===== END TRANSACTION DETAILS =====');
    } catch (error) {
        console.error('handleDepositAndBorrow: Error preparing transaction data', error)
        throw error
    }

    if (!txData) {
        console.error('handleDepositAndBorrow: No transaction data was returned')
        throw new Error('No transaction request!')
    }

    console.log('handleDepositAndBorrow: Transaction data prepared', { 
        to: txData.to,
        data: txData.data,
        value: txData.value?.toString() 
    })

    try {
        console.log('handleDepositAndBorrow: Estimating gas with floor', { floorGasLimit: vaultId ? null : '865000' })
    const tx = await handlePreTxGasEstimate(signer, txData, vaultId ? null : '865000')
        console.log('handleDepositAndBorrow: Gas estimation successful', { 
            gasLimit: tx.gasLimit?.toString() 
        })

        console.log('handleDepositAndBorrow: Sending transaction')
    const txResponse = await signer.sendTransaction(tx)
        console.log('handleDepositAndBorrow: Transaction sent successfully', { 
            hash: txResponse.hash 
        })
    return txResponse
    } catch (errorUnknown) {
        const error = errorUnknown as any;
        console.error('handleDepositAndBorrow: Error during transaction execution', error)
        if (error.error?.data) {
            console.error('handleDepositAndBorrow: Transaction error data', error.error.data)
        }
        throw error
    }
}

export const handleDepositAndRepay = async (signer: JsonRpcSigner, vaultData: IVaultData, vaultId = '') => {
    if (!signer || !vaultData) {
        return false
    }
    if (!vaultId) throw new Error('No vault Id')

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

    let txData: EthersTransactionRequest = {}

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

