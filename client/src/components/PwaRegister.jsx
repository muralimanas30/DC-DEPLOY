"use client";

import { useEffect } from "react";

export default function PwaRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        const registerServiceWorker = async () => {
            try {
                await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            } catch {
                // Keep silent for unsupported contexts or one-off registration failures.
            }
        };

        if (document.readyState === "complete") {
            registerServiceWorker();
            return;
        }

        window.addEventListener("load", registerServiceWorker, { once: true });
        return () => window.removeEventListener("load", registerServiceWorker);
    }, []);

    return null;
}
