import { NETWORK_ID, VITE_GRAPH_API_KEY } from '../constants'
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client'
import { HttpLink } from '@apollo/client/link/http'
import { setContext } from '@apollo/client/link/context'

// Updated to use PARYS protocol's dedicated subgraph instead of HAI
const uri = NETWORK_ID === 42161
        ? 'https://gateway.thegraph.com/api/subgraphs/id/Gp75utuE9bc8woxmTgtyfWCgB6rkzwYage85Siha2Xmg'
        : 'https://gateway.thegraph.com/api/subgraphs/id/Gp75utuE9bc8woxmTgtyfWCgB6rkzwYage85Siha2Xmg'

const httpLink = new HttpLink({
    uri,
})

// Add authentication header for Graph API
const authLink = setContext((_, { headers }) => {
    return {
        headers: {
            ...headers,
            Authorization: VITE_GRAPH_API_KEY ? `Bearer ${VITE_GRAPH_API_KEY}` : '',
        }
    }
})

// Configure the cache to handle time-series entities
export const client = new ApolloClient({
    link: authLink.concat(httpLink),
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

// Configure uniClient with authorization
const uniHttpLink = new HttpLink({
    uri: `https://gateway.thegraph.com/api/subgraphs/id/Gp75utuE9bc8woxmTgtyfWCgB6rkzwYage85Siha2Xmg`,
})

export const uniClient = new ApolloClient({
    link: authLink.concat(uniHttpLink),
    cache: new InMemoryCache(),
})
