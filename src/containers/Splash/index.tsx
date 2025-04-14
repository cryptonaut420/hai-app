import { useEffect } from 'react'
import { useHistory } from 'react-router-dom'

export function Splash() {
    const history = useHistory()
    
    // Automatically redirect to the vaults page
    useEffect(() => {
        history.replace('/vaults')
    }, [history])
    
    // Return null as we'll immediately redirect
    return null
}
