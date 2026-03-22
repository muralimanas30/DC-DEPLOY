"use client"

import { SessionProvider } from "next-auth/react"
import { Provider as ReduxProvider } from "react-redux"
import { store } from "./store"

export default function Providers({ children }) {
    return (
        <SessionProvider>
            <ReduxProvider store={store}>
                {children}
            </ReduxProvider>
        </SessionProvider>
    )
}
