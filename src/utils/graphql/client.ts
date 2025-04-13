import { NETWORK_ID, VITE_GRAPH_API_KEY } from '../constants'
import { ApolloClient, InMemoryCache } from '@apollo/client'

// Updated to use PARYS protocol's dedicated subgraph instead of HAI
const uri =
    NETWORK_ID === 10
        ? 'https://api.studio.thegraph.com/query/109073/parys-protocol/v0.0.1'
        : 'https://api.studio.thegraph.com/query/109073/parys-protocol/v0.0.1' // Use same for both until a testnet version is deployed

export const client = new ApolloClient({
    uri,
    cache: new InMemoryCache(),
})

export const uniClient = new ApolloClient({
    uri: `https://gateway-arbitrum.network.thegraph.com/api/${VITE_GRAPH_API_KEY}/subgraphs/id/EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9`,
    cache: new InMemoryCache(),
})
