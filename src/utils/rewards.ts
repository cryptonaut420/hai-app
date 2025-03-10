export const REWARDS = {
    vaults: {
        WETH: {
            AGREE: 10,
            OP: 0,
        },
        WSTETH: {
            AGREE: 20,
            OP: 10,
        },
        APXETH: {
            AGREE: 50,
            OP: 50,
        },
        RETH: {
            AGREE: 20,
            OP: 10,
        },
        OP: {
            AGREE: 10,
            OP: 0,
        },
        TBTC: {
            AGREE: 10,
            OP: 0,
        },
        SNX: {
            AGREE: 0,
            OP: 0,
        },
        PARYSVELO: {
            AGREE: 10,
            OP: 0,
        },

        // Testnet
        WBTC: {
            AGREE: 0,
            OP: 0,
        },
        STN: {
            AGREE: 20,
            OP: 20,
        },
        TTM: {
            AGREE: 30,
            OP: 30,
        },
    },
    uniswap: {
        ['0x146b020399769339509c98b7b353d19130c150ec'.toLowerCase()]: {
            AGREE: 25,
            OP: 75,
        },
    },
    velodrome: {
        // sAMMV2-PARYS/sUSD
        ['0xbdED651C03E2bC332AA49C1ffCa391eAA3ea6B86'.toLowerCase()]: {
            AGREE: 15,
            OP: 35,
        },
        // sAMMV2-PARYS/LUSD
        ['0x588f26d5BefE74dC61694a7B36227C0e0C52C0f9'.toLowerCase()]: {
            AGREE: 15,
            OP: 50,
        },
        // CL50-PARYS/LUSD
        ['0xA61FBA486e2d04C4D865183A47fc1C9F6F4Cec1f'.toLowerCase()]: {
            AGREE: 15,
            OP: 50,
        },
        // vAMMV2-AGREE/PARYS
        ['0xf2d3941b6E1cbD3616061E556Eb06986147715d1'.toLowerCase()]: {
            AGREE: 25,
            OP: 25,
        },
        // vAMMV2-AGREE/OP
        ['0xf4638dC488F9C826DC40250515592E678E447238'.toLowerCase()]: {
            AGREE: 25,
            OP: 0,
        },
        // vAMMV2-pxETH/PARYS
        ['0xD5fE49a4c0Fc482Ee757DF703A3a332DB209aC2e'.toLowerCase()]: {
            AGREE: 25,
            OP: 75,
        },
        // vAMM-PARYS/rETH
        ['0x4cE1d27d824062B159D000e3212B2F5106792C34'.toLowerCase()]: {
            AGREE: 35,
            OP: 0,
        },
        // vAMMV2-SAIL/AGREE
        ['0xB5cD4bD4bdB5C97020FBE192258e6F08333990E2'.toLowerCase()]: {
            AGREE: 0,
            OP: 0,
        },
    },
    default: {
        OP: 0,
        AGREE: 0,
    },
}

export const VELO_SUGAR_ADDRESS = '0x3b919747b46b13cffd9f16629cff951c0b7ea1e2'

export const AGREE_ADDRESS = '0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404'
export const PARYS_ADDRESS = '0x10398AbC267496E49106B07dd6BE13364D10dC71'

export const PARYS_AGREE_SYMBOL = 'vAMMV2-PARYS/AGREE'

export const CL50_PARYS_LUSD_SYMBOL = '0xA61FBA486e2d04C4D865183A47fc1C9F6F4Cec1f'
export const CL50_PARYS_LUSD_ADDRESS = '0xA61FBA486e2d04C4D865183A47fc1C9F6F4Cec1f'

// const veloPools = [
// 	{
// 			pair: ['PARYS', 'SUSD'] as any,
// 			rewards: {
// 					OP: 100,
// 					AGREE: 30,
// 			},
// 			earnLink:
// 					'https://velodrome.finance/deposit?token0=0x10398AbC267496E49106B07dd6BE13364D10dC71&token1=0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9&type=0',
// 	},
// 	{
// 			pair: ['AGREE', 'OP'] as any,
// 			rewards: {
// 					OP: 0,
// 					AGREE: 50,
// 			},
// 			earnLink:
// 					'https://velodrome.finance/deposit?token0=0x4200000000000000000000000000000000000042&token1=0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404&type=-1',
// 	},
// ]
