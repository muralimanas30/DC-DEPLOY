"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { connectSocket, disconnectSocket } from "@/hooks/useSocket";

/**
 * Establishes a single authenticated socket connection for the active session.
 */
export default function SocketBootstrap({ children }) {
    const { data: session, status } = useSession();
    const token = session?.user?.token;

    useEffect(() => {
        if (status === "loading") {
            return;
        }

        if (status !== "authenticated" || !token) {
            disconnectSocket();
            return;
        }

        connectSocket(token);
    }, [status, token]);

    return children;
}