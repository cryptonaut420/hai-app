import { createContext, useContext, ReactNode } from 'react'

// Dummy implementation that provides empty data
type VelodromePriceContext = {
    prices?: {
        AGREE: { raw: string; }
        DINERO: { raw: string; }
    }
    refetch: () => void
}

const defaultState: VelodromePriceContext = {
    prices: {
        AGREE: { raw: "0" },
        DINERO: { raw: "0" }
    },
    refetch: () => undefined,
}

const VelodromePriceContext = createContext<VelodromePriceContext>(defaultState)

export const useVelodromePrices = () => useContext(VelodromePriceContext)

type Props = {
    children: ReactNode
}

export function VelodromePriceProvider({ children }: Props) {
    // Dummy implementation that doesn't fetch any real data
    return (
        <VelodromePriceContext.Provider
            value={{
                prices: defaultState.prices,
                refetch: () => undefined,
            }}
        >
            {children}
        </VelodromePriceContext.Provider>
    )
}
