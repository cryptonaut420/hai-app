import { NETWORK_ID, VITE_GRAPH_API_KEY } from '../constants'
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client'
import { HttpLink } from '@apollo/client/link/http'

// Updated to use PARYS protocol's dedicated subgraph instead of HAI
const uri = NETWORK_ID === 42161
        ? 'https://gateway.thegraph.com/api/subgraphs/id/Gp75utuE9bc8woxmTgtyfWCgB6rkzwYage85Siha2Xmg'
        : 'https://gateway.thegraph.com/api/subgraphs/id/Gp75utuE9bc8woxmTgtyfWCgB6rkzwYage85Siha2Xmg'

const httpLink = new HttpLink({
    uri,
})

// Configure the cache to handle time-series entities
export const client = new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache({
        typePolicies: {
            Query: {
                fields: {
                    // Configure merged fields for time-series entities
                    safes: {
                        // Safes are now time-series - we need to make sure queries get the latest version
                        // This is handled in the query itself with orderBy and first: 1
                    },
                    internalCoinBalances: {
                        // InternalCoinBalances are now time-series
                        // This is handled in the query itself with orderBy and first: 1
                    },
                    collateralTypes: {
                        // CollateralTypes are now time-series
                        // This is handled in the query itself with orderBy and first: 1
                    },
                    systemStates: {
                        // SystemStates are now time-series
                        // This is handled in the query itself with orderBy and first: 1
                    },
                    internalCollateralBalances: {
                        // InternalCollateralBalances are now time-series
                        // This is handled in the query itself with orderBy and first: 1
                    },
                    internalDebtBalances: {
                        // InternalDebtBalances are now time-series
                        // This is handled in the query itself with orderBy and first: 1
                    }
                }
            }
        }
    }),
})

export const uniClient = new ApolloClient({
    uri: `https://gateway-arbitrum.network.thegraph.com/api/${VITE_GRAPH_API_KEY}/subgraphs/id/EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9`,
    cache: new InMemoryCache(),
})
