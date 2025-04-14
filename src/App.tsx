import React, { Suspense } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'
import { ApolloProvider } from '@apollo/client'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { Shared } from '~/containers/Shared'
import { GlobalStyle } from '~/styles'
import { ChainId, NETWORK_ID, client } from '~/utils'
import { AnalyticsProvider } from '~/providers/AnalyticsProvider'
import { ClaimsProvider } from '~/providers/ClaimsProvider'
import { EffectsProvider } from '~/providers/EffectsProvider'
import { ErrorBoundary } from '~/ErrorBoundary'
import type { Theme } from '~/types'
import { Splash } from '~/containers/Splash'
import { Analytics } from '~/containers/Analytics'
import { Auctions } from '~/containers/Auctions'
import { Earn } from '~/containers/Earn'
import { Vaults } from '~/containers/Vaults'
import { Contracts } from '~/containers/Contracts'
import { Learn } from './containers/Learn'
import { VaultExplorer } from './containers/Vaults/Explore'
import { TestClaim } from './containers/TestClaim'

declare module 'styled-components' {
    export interface DefaultTheme extends Theme {}
}

const App = () => {
    return (
        <I18nextProvider i18n={i18next}>
            <GlobalStyle />
            <ErrorBoundary>
                <ApolloProvider client={client}>
                    <AnalyticsProvider>
                        <EffectsProvider>
                            <ClaimsProvider>
                                <Shared>
                                    <Suspense fallback={null}>
                                        <>
                                            <Switch>
                                                {NETWORK_ID === ChainId.OPTIMISM_SEPOLIA && (
                                                    <Route
                                                        exact
                                                        strict
                                                        component={TestClaim}
                                                        path={'/test/claim'}
                                                    />
                                                )}
                                                <Route exact strict component={Splash} path={'/'} />
                                                <Route exact strict component={Auctions} path={'/auctions'} />
                                                <Route exact strict component={Analytics} path={'/analytics'} />
                                                <Route exact strict component={Contracts} path={'/contracts'} />
                                                <Route exact strict component={Learn} path={'/learn'} />
                                                <Route exact strict component={Earn} path={'/earn'} />
                                                <Route
                                                    exact
                                                    strict
                                                    component={VaultExplorer}
                                                    path={'/vaults/explore'}
                                                />
                                                <Route
                                                    exact
                                                    strict
                                                    component={Vaults}
                                                    path={'/vaults/manage'}
                                                />
                                                <Route exact strict component={Vaults} path={'/vaults/open'} />
                                                <Route exact component={Vaults} path={'/vaults/:idOrOwner'} />
                                                <Route exact strict component={Vaults} path={'/vaults'} />

                                                <Redirect from="*" to="/" />
                                            </Switch>
                                        </>
                                    </Suspense>
                                </Shared>
                            </ClaimsProvider>
                        </EffectsProvider>
                    </AnalyticsProvider>
                </ApolloProvider>
            </ErrorBoundary>
        </I18nextProvider>
    )
}

export default App
