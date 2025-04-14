import type { IconProps } from '~/types'
import { useHaiTheme } from '~/providers/HaiThemeProvider'

type Props = IconProps & {
    filled?: boolean
}
export function HaiFace({ size = 40, filled, ...props }: Props) {
    const { theme } = useHaiTheme()

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            stroke="#000000"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            {/* Simple circle with P for Parisii logo - Replace with your own logo */}
            <circle 
                cx="20" 
                cy="20" 
                r="15" 
                fill={filled ? theme.colors.yellowish : undefined}
                stroke="black"
                strokeWidth="1.25"
            />
            <text
                x="20"
                y="25"
                fontFamily="Arial"
                fontSize="18"
                textAnchor="middle"
                fill="black"
            >
                P
            </text>
        </svg>
    )
}
