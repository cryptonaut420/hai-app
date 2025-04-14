import type { ReactChildren } from '~/types'

import styled from 'styled-components'
import { CenteredFlex, FlexProps, Text } from '~/styles'
import { Loader } from './Loader'
import { useEffect, useState } from 'react'

export type ContentWithStatusProps = {
    loading: boolean
    loadingContent?: ReactChildren
    error?: string
    errorContent?: ReactChildren
    isEmpty?: boolean
    emptyContent?: ReactChildren
    children: ReactChildren
}
export function ContentWithStatus({
    loading,
    loadingContent,
    error,
    errorContent,
    isEmpty,
    emptyContent,
    children,
}: ContentWithStatusProps) {
    if (loading) return <Message>{loadingContent || <LoadingContent />}</Message>
    if (error) {
        console.error('ContentWithStatus error detail:', error);
        try {
            // Try to clean up the error message if it contains "invalid address" with empty string
            if (typeof error === 'string' && error.includes('invalid address') && error.includes('value=""')) {
                return (
                    <Message>
                        <Text $color="darkRed">
                            No auction data is available at this time
                        </Text>
                    </Message>
                );
            }
        } catch (e) {
            console.error('Error while trying to clean up error message:', e);
        }
        
        return (
            <Message>
                {errorContent || (
                    <Text $color="darkRed">
                        {error !== 'Error' ? error : 'An error occurred while loading data'}
                    </Text>
                )}
            </Message>
        );
    }
    if (isEmpty || !children) return <Message>{emptyContent || 'No items matched your search'}</Message>

    return <>{children}</>
}

const Message = styled(CenteredFlex).attrs((props: FlexProps) => ({
    $width: '100%',
    $column: true,
    $gap: 24,
    $padding: '24px',
    ...props,
}))``

function LoadingContent() {
    const [text, setText] = useState<HTMLElement | null>(null)

    useEffect(() => {
        if (!text) return

        let dots = 3
        const int = setInterval(() => {
            dots = (dots + 1) % 4
            text.textContent = `Loading${'.'.repeat(dots)}`
        }, 500)

        return () => clearInterval(int)
    }, [text])

    return (
        <Loader color="black">
            <Text ref={setText} style={{ width: '75px' }}>
                Loading...
            </Text>
        </Loader>
    )
}
