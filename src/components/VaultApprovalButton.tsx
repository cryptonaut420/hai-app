import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import styled from 'styled-components'
import { CenteredFlex, Flex, Text } from '~/styles'
import { HaiButton } from '~/styles'
import { handleDepositAndBorrow } from '~/services/blockchain'
import { JsonRpcSigner } from '@ethersproject/providers'
import { TransactionResponse } from '@ethersproject/providers'
import { IVaultData } from '~/types/vaults'

const StyledButton = styled(HaiButton)`
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ProgressBar = styled.div<{ $progress: number }>`
  position: absolute;
  height: 4px;
  bottom: 0;
  left: 0;
  background-color: rgba(255, 255, 255, 0.5);
  width: ${props => props.$progress}%;
  transition: width 0.3s ease;
`

const InfoText = styled(Text)`
  font-size: 0.8em;
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.6);
`

interface VaultApprovalButtonProps {
  signer: JsonRpcSigner
  vaultData: IVaultData
  vaultId?: string
  onSuccess?: () => void
  onError?: (error: Error) => void
  buttonLabel?: string
  disabled?: boolean
}

export function VaultApprovalButton({
  signer,
  vaultData,
  vaultId = '',
  onSuccess,
  onError,
  buttonLabel = 'Deposit & Borrow',
  disabled = false
}: VaultApprovalButtonProps) {
  const [state, setState] = useState<{
    isChecking: boolean;
    needsApproval: boolean;
    isApproving: boolean;
    isExecuting: boolean;
    isCompleted: boolean;
    error: string | null;
    approvalTxHash: string | null;
    executionTxHash: string | null;
    collateralAmount: string;
    depositStatus: any | null;
  }>({
    isChecking: true,
    needsApproval: false,
    isApproving: false,
    isExecuting: false,
    isCompleted: false,
    error: null,
    approvalTxHash: null,
    executionTxHash: null,
    collateralAmount: '0',
    depositStatus: null
  });

  // Log when component mounts or vaultData changes
  useEffect(() => {
    console.log("VaultApprovalButton mounted/updated with vaultData:", vaultData);
  }, [vaultData]);

  // Check approval status on load
  useEffect(() => {
    async function checkApproval() {
      if (!signer || !vaultData) return;
      
      try {
        setState(prev => ({ ...prev, isChecking: true, error: null }));
        
        console.log("Checking approval for collateral:", vaultData.collateral);
        
        // Get deposit status including approval info
        const depositStatus = await handleDepositAndBorrow(signer, vaultData, vaultId);
        
        console.log("Deposit status result:", depositStatus);
        
        // Handle case when depositStatus is false
        if (!depositStatus) {
          setState(prev => ({
            ...prev,
            isChecking: false,
            error: "Failed to check approval status"
          }));
          return;
        }
        
        // Format the collateral amount for display
        const collateralAmount = depositStatus.collateralBN ? 
          ethers.utils.formatEther(depositStatus.collateralBN) : '0';
        
        setState(prev => ({
          ...prev,
          isChecking: false,
          needsApproval: depositStatus.needsApproval,
          collateralAmount,
          depositStatus
        }));
      } catch (error) {
        console.error('Error checking approval:', error);
        setState(prev => ({
          ...prev, 
          isChecking: false,
          error: error instanceof Error ? error.message : 'Error checking token approval'
        }));
      }
    }
    
    checkApproval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer, vaultData, vaultId]);

  // Handle approval
  const handleApprove = async () => {
    if (!state.depositStatus) return;
    
    try {
      setState(prev => ({ ...prev, isApproving: true, error: null }));
      
      console.log("Approving collateral token...");
      // Execute approval transaction
      const txResponse = await state.depositStatus.approveCollateral();
      console.log("Approval transaction sent:", txResponse.hash);
      
      setState(prev => ({
        ...prev,
        isApproving: false,
        needsApproval: false,
        approvalTxHash: txResponse.hash
      }));
    } catch (error) {
      console.error('Approval error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error approving token';
      setState(prev => ({
        ...prev,
        isApproving: false,
        error: errorMessage
      }));
      
      if (onError) onError(new Error(errorMessage));
    }
  };

  // Handle execute transaction
  const handleExecute = async () => {
    if (!state.depositStatus) {
      console.error("Cannot execute transaction: depositStatus is null");
      return;
    }
    
    try {
      console.log("Executing deposit and borrow transaction...");
      setState(prev => ({ ...prev, isExecuting: true, error: null }));
      
      // Execute deposit and borrow with additional logging
      console.log("Before calling executeDepositAndBorrow with vaultData:", vaultData);
      
      const txResponse = await state.depositStatus.executeDepositAndBorrow();
      console.log("Transaction submitted successfully:", txResponse);
      
      // Create a success object
      const successResult = {
        success: true,
        hash: txResponse.hash,
        executionTxHash: txResponse.hash
      };
      
      setState(prev => ({
        ...prev,
        isExecuting: false,
        isCompleted: true,
        executionTxHash: txResponse.hash
      }));
      
      console.log("Calling onSuccess callback");
      if (onSuccess) onSuccess();
      
      // Return a success object
      return successResult;
    } catch (error) {
      console.error('Transaction execution error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error executing transaction';
      setState(prev => ({
        ...prev,
        isExecuting: false,
        error: errorMessage
      }));
      
      if (onError) onError(new Error(errorMessage));
      
      return {
        success: false,
        error: errorMessage
      };
    }
  };

  // Calculate progress for progressive UI
  const getProgress = () => {
    if (state.isCompleted) return 100;
    if (state.isExecuting) return 75;
    if (!state.needsApproval || state.approvalTxHash) return 50;
    if (state.isApproving) return 25;
    return 0;
  };

  // Get button label
  const getButtonLabel = () => {
    if (state.isChecking) return 'Checking Approval...';
    if (state.isApproving) return 'Approving Token...';
    if (state.needsApproval) return `Approve ${vaultData.collateral}`;
    if (state.isExecuting) return 'Processing...';
    if (state.isCompleted) return 'Success!';
    return buttonLabel;
  };

  // Determine if button should be disabled
  const isButtonDisabled = () => {
    return disabled || 
      state.isChecking || 
      state.isApproving || 
      state.isExecuting || 
      state.isCompleted ||
      !!state.error;
  };

  // Determine button action
  const handleButtonClick = () => {
    console.log("Button clicked, needsApproval:", state.needsApproval);
    if (state.needsApproval) {
      handleApprove();
    } else {
      handleExecute();
    }
  };

  return (
    <Flex $direction="column" $width="100%">
      <StyledButton 
        onClick={handleButtonClick}
        disabled={isButtonDisabled()}
      >
        {getButtonLabel()}
        <ProgressBar $progress={getProgress()} />
      </StyledButton>
      
      {state.isChecking && (
        <InfoText>Checking token approval status...</InfoText>
      )}
      
      {state.needsApproval && !state.isApproving && !state.error && (
        <InfoText>
          You need to approve {state.collateralAmount} {vaultData.collateral} tokens before proceeding.
        </InfoText>
      )}
      
      {state.approvalTxHash && !state.isExecuting && !state.error && (
        <InfoText>
          Token approval successful! Click again to continue.
        </InfoText>
      )}
      
      {state.error && (
        <InfoText style={{ color: 'red' }}>
          Error: {state.error}
        </InfoText>
      )}
    </Flex>
  );
} 