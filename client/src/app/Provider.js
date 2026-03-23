"use client"

import { SessionProvider } from "next-auth/react"
import { Provider as ReduxProvider } from "react-redux"
import { store } from "./store"
import SocketBootstrap from "@/components/SocketBootstrap"

export default function Providers({ children }) {
    return (
        <SessionProvider>
            <ReduxProvider store={store}>
                <SocketBootstrap>
                    {children}
                </SocketBootstrap>
            </ReduxProvider>
        </SessionProvider>
    )
}
