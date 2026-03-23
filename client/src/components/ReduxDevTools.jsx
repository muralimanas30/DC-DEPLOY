"use client";
/**
 * ReduxDevTools
 * Shows Redux state and actions using redux-devtools-extension for debugging.
 * Only renders in development mode.
 */
import React from "react";
import { useStore } from "react-redux";

export default function ReduxDevTools() {
    const store = useStore();
    const isDevelopment = process.env.NODE_ENV === "development";

    React.useEffect(() => {
        if (!isDevelopment) return;
        if (typeof window !== "undefined" && window.__REDUX_DEVTOOLS_EXTENSION__) {
            window.__REDUX_DEVTOOLS_EXTENSION__.connect();
        }
    }, [isDevelopment]);

    // Only show in development
    if (!isDevelopment) return null;

    // Optionally, show a minimal UI or just nothing (since devtools is browser extension)
    return (
        <div className="fixed bottom-2 right-2 z-50">
            <span className="badge badge-info badge-outline">Redux DevTools Active</span>
        </div>
    );
}
