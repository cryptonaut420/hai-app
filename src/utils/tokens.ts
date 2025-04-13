import ethImg from '~/assets/eth-img.svg'
import haiImg from '~/assets/parisii-logo.webp'
import kiteImg from '~/assets/kite-img.svg'
import opImg from '~/assets/op-img.svg'
import wethImg from '~/assets/weth-img.svg'

export type Tokens = {
    [key: string]: {
        name: string
        icon: string
        gebName: string
        balance: string
        address: string
    }
}

export const TOKEN_LOGOS = {
    ETH: ethImg,
    PARYS: haiImg,
    AGREE: haiImg,
    OP: opImg,
    PEUA: haiImg,
    PBJO: haiImg,
}

export const tokenMap: Record<string, string> = {
    PROTOCOL_TOKEN: 'AGREE',
    COIN: 'PARYS',
    PROTOCOL_TOKEN_LP: 'AGREE/ETH LP',
}

export type Token = {
    symbol: string
    name: string
    icon: string
}
export const tokenAssets: Record<string, Token> = {
    ETH: {
        symbol: 'ETH',
        name: 'Ethereum',
        icon: ethImg,
    },
    PARYS: {
        symbol: 'PARYS',
        name: 'PARYS',
        icon: haiImg,
    },
    AGREE: {
        symbol: 'AGREE',
        name: 'AGREE',
        icon: kiteImg,
    },
    OP: {
        symbol: 'OP',
        name: 'Optimism Token',
        icon: opImg,
    },
    WETH: {
        symbol: 'WETH',
        name: 'Wrapped Ethereum',
        icon: wethImg,
    },
    PEUA: {
        symbol: 'PEUA',
        name: 'PEUA',
        icon: haiImg,
    },
    PBJO: {
        symbol: 'PBJO',
        name: 'PBJO',
        icon: haiImg,
    },
}

type TokenDetails = {
    type: 'ERC20' | 'ERC721'
    options: {
        address: string
        symbol: string
        decimals: number
        image?: string
    }
}
export const addTokensToMetamask = (tokens: TokenDetails | TokenDetails[]) => {
    tokens = Array.isArray(tokens) ? tokens : [tokens]
    const provider = window.ethereum as any
    if (!provider?.request) throw new Error(`No injected provider found`)
    return Promise.all(
        tokens.map((params) =>
            provider.request({
                method: 'wallet_watchAsset',
                params,
            })
        )
    ).then((successes: boolean[]) => successes.every((isSuccess) => isSuccess))
}
