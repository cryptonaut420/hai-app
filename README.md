<p align="center">
  <a href="https://reflexer.finance" target="_blank">
    <img alt="Reflexer" src="https://i.ibb.co/CtWRHQd/android-chrome-512x512.png" width="60" />
  </a>
</p>
<h1 align="center">
  HAI App
</h1>

Deposit your crypto assets, generate HAI and lever up your position.

<!-- - Website: [reflexer.finance](https://reflexer.finance/)
- App: [app.reflexer.finance](https://app.reflexer.finance)
- Docs: [docs.reflexer.finance](https://docs.reflexer.finance/)
- Twitter: [@reflexerfinance](https://twitter.com/reflexerfinance)
- Discord: [Reflexer](https://discord.com/invite/83t3xKT)
- Whitepaper: [Link](https://github.com/reflexer-labs/whitepapers/blob/master/English/hai-english.pdf) -->

## Development

### Install Dependencies

```bash
yarn
```

### Run

```bash
yarn start
```

### Configuring the environment

To have the app default to a different network when a wallet is not connected:

1. Create a file and name it `.env`
2. Change `VITE_MAINNET_PUBLIC_RPC` to e.g. `"https://opt-mainnet.g.alchemy.com/v2/{YOUR_ALCHEMY_KEY}"`
3. Change `VITE_TESTNET_PUBLIC_RPC` to e.g. `"https://opt-sepolia.g.alchemy.com/v2/{YOUR_ALCHEMY_KEY}"`
4. Change `VITE_ALCHEMY_KEY` to e.g. `"YOUR_ALCHEMY_KEY"`
5. Change `VITE_WALLETCONNECT_ID` to e.g. `"YOUR_WALLETCONNECT_API_KEY"`
6. Change `VITE_GRAPH_API_KEY` to e.g. `"YOUR_GRAPH_API_KEY"`

### Local Development with Anvil

For local development with Anvil:

1. Start your local Anvil chain:
   ```bash
   anvil
   ```

2. Set up environment variables for local development:
   ```
   # Set to Anvil's default chain ID
   VITE_NETWORK_ID=31337
   
   # Point to your contract configuration files
   LOCAL_CONTRACTS_PATH=./data/31337-contracts.json
   LOCAL_TOKENS_PATH=./data/31337-tokens.json
   ```

3. Create contract configuration files in the `data` directory:
   - `31337-contracts.json` - Contains contract addresses
   - `31337-tokens.json` - Contains token definitions

4. Start the application:
   ```bash
   yarn start
   ```

See [LOCAL_DEV.md](./LOCAL_DEV.md) for detailed instructions.

## Testing

### Cypress integration test

```bash
yarn test:e2e
```

### Jest test

```bash
yarn test
```
