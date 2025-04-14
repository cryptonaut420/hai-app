import { AvatarComponent } from '@rainbow-me/rainbowkit'
import haiImg from '~/assets/parisii-logo.webp'

import styled from 'styled-components'
import { CenteredFlex } from '~/styles'

export const CustomAvatar: AvatarComponent = ({ address, ensImage, size }) => {
    if (ensImage)
        return <img src={ensImage} alt={address} width={size} height={size} style={{ borderRadius: '999px' }} />

    return (
        <Container $size={size}>
            <img src={haiImg} alt="Parisii" style={{ width: '70%', height: 'auto' }} />
        </Container>
    )
}

const Container = styled(CenteredFlex)<{ $size: number }>`
    width: ${({ $size }) => $size}px;
    height: ${({ $size }) => $size}px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.greenish};
    border: ${({ theme }) => theme.border.medium};
`
