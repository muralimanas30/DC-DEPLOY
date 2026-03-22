"use client";
/**
 * ReduxDevTools
 * Shows Redux state and actions using redux-devtools-extension for debugging.
 * Only renders in development mode.
 */
import React from "react";
import { useStore } from "react-redux";

export default function ReduxDevTools() {
    // Only show in development
    if (process.env.NODE_ENV !== "development") return null;
    const store = useStore();

    React.useEffect(() => {
        if (typeof window !== "undefined" && window.__REDUX_DEVTOOLS_EXTENSION__) {
            window.__REDUX_DEVTOOLS_EXTENSION__.connect();
        }
    }, []);

    // Optionally, show a minimal UI or just nothing (since devtools is browser extension)
    return (
        <div className="fixed bottom-2 right-2 z-50">
            <span className="badge badge-info badge-outline">Redux DevTools Active</span>
        </div>
    );
}
