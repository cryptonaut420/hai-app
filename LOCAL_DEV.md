# Local Development with Anvil

This guide explains how to set up the Parys App to work with your local Anvil instance for development.

## Setup Steps

1. **Start your local Anvil chain**

   ```bash
   anvil
   ```

2. **Set up your environment variables**

   - Copy `.env.local.example` to `.env.local`
   - Edit `.env.local` to set `VITE_NETWORK_ID=31337` (Anvil's default chain ID)
   - Set the paths to your contract addresses and token JSON files:
     ```
     LOCAL_CONTRACTS_PATH=./local-contracts.json
     LOCAL_TOKENS_PATH=./local-tokens.json
     ```

3. **Create your contract configuration files**
   
   - Copy `local-contracts.example.json` to `local-contracts.json`
   - Copy `local-tokens.example.json` to `local-tokens.json`
   - Update these files with the actual addresses of your deployed contracts on Anvil

4. **Start the application**

   ```bash
   yarn start
   ```

## How It Works

- The application detects the `VITE_NETWORK_ID=31337` and uses the "localnet" network
- When using "localnet", our forked SDK looks for the JSON files specified in your `.env.local`
- The SDK loads contract addresses from these files instead of using hardcoded addresses
- This allows you to test with your own contracts on a local Anvil chain

## Troubleshooting

- Make sure your Anvil chain is running on port 8545 (default)
- Ensure you've deployed all necessary contracts to your local chain
- Check that your JSON files have the correct format and contain all required addresses
- If you see errors about missing contracts, check for typos in your JSON files

## Notes

- This setup is for development only and should not be used in production
- The app will automatically connect to your local chain when you set the right network ID
- You can modify the contract addresses without rebuilding the app - just update the JSON files 