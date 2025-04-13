# PARYS Vault System Documentation

## Overview
The PARYS vault system is a decentralized lending protocol that allows users to deposit collateral and borrow PARYS tokens. This document provides a detailed technical overview of how the vault system is implemented in the frontend application.

## Core Components

### 1. Vault Types and Interfaces
Located in `src/types/vaults.ts`, the core vault types define the structure of vault data:

```typescript
export type IVault = {
    id: string
    date: string
    vaultHandler: string
    riskState: number
    collateral: string
    debt: string
    totalDebt: string
    availableDebt: string
    accumulatedRate: string
    collateralRatio: string
    freeCollateral: string
    currentRedemptionPrice: string
    currentLiquidationPrice: string
    internalCollateralBalance: string
    liquidationCRatio: string
    liquidationPenalty: string
    liquidationPrice: string
    totalAnnualizedStabilityFee: string
    currentRedemptionRate: string
    collateralType: string
    collateralName: string
}
```

### 2. Vault Actions
The system supports several vault operations defined in `src/utils/vaults.ts`:

```typescript
export enum VaultAction {
    DEPOSIT_BORROW,
    DEPOSIT_REPAY,
    WITHDRAW_BORROW,
    WITHDRAW_REPAY,
    CREATE,
    INFO,
}
```

### 3. Collateral Management
The system manages collateral tokens through the `connectWalletModel` state, which maintains a list of available collateral tokens. Each token must have `isCollateral: true` to be eligible for vault creation.

## Available Collateral Types
The system supports the following collateral types (defined in `src/utils/rewards.ts`):

### Mainnet Collaterals
- PEUA
- PBJO


## Vault Operations

### 1. Creating a Vault
- Users can create new vaults through the `/vaults/open` route
- Default collateral is WETH if none specified
- System validates available collateral types against `tokensData`

### 2. Managing Vaults
- Vault management is handled through the `/vaults/manage` route
- Supports operations like:
  - Depositing collateral
  - Withdrawing collateral
  - Borrowing PARYS
  - Repaying PARYS

### 3. Vault Safety Checks
The system implements several safety checks:
- Minimum collateral requirements
- Liquidation ratio monitoring
- Debt ceiling limits
- Collateral ratio validation

## Integration with Smart Contracts
The vault system integrates with smart contracts through the `@parisii-inc/parys-sdk` library:

1. Contract Interactions:
   - Vault creation
   - Collateral management
   - Debt operations
   - Liquidation handling

2. State Management:
   - Real-time vault data updates
   - Collateral price feeds
   - Liquidation data monitoring

## Rewards System
Each collateral type has associated rewards in AGREE and OP tokens:

```typescript
export const REWARDS = {
    vaults: {
        WETH: { AGREE: 10, OP: 0 },
        WSTETH: { AGREE: 20, OP: 10 },
        APXETH: { AGREE: 50, OP: 50 },
        // ... other collateral rewards
    }
}
```

## Error Handling
The system implements comprehensive error handling for various scenarios:

```typescript
export const vaultInfoErrors = {
    NO_WALLET: "Connect a valid wallet to continue",
    NO_PROXY: "Create a proxy contract to continue",
    INSUFFICIENT_COLLATERAL: "Insufficient collateral balance",
    INSUFFICIENT_PARYS: "Insufficient $PARYS balance",
    // ... other error cases
}
```

## State Management
The vault system uses a combination of:
1. React Context (VaultProvider)
2. Easy Peasy store (vaultModel)
3. Local component state

## Adding New Collateral Types
To add a new collateral type:

1. Update the smart contracts in the `parys-sdk` library
2. Add the collateral to the rewards configuration in `rewards.ts`
3. The frontend will automatically pick up the new collateral through `tokensData`

## Security Considerations
1. All vault operations require proper approvals
2. Collateral ratios are continuously monitored
3. Liquidation system protects against undercollateralized positions
4. Debt ceilings prevent excessive borrowing

## Testing
The system includes comprehensive tests:
- Unit tests for vault operations
- Integration tests for contract interactions
- Mock data for testing different scenarios

## Future Considerations
1. Additional collateral types
2. Enhanced reward mechanisms
3. Improved liquidation system
4. Additional safety features

## Related Documentation
- [PARYS SDK Documentation](https://github.com/parisii-inc/parys-sdk)
- [Smart Contract Documentation](https://github.com/parisii-inc/parys-contracts) 