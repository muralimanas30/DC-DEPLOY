"use client";

import { useCallback, useEffect, useState } from "react";

const OFFLINE_MODE_STORAGE_KEY = "dc.offline-mode.v1";
const OFFLINE_MODE_EVENT = "dc:offline-mode-changed";

function toBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return false;
}

export default function useOfflineMode() {
    const [isOfflineMode, setIsOfflineMode] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const stored = window.localStorage.getItem(OFFLINE_MODE_STORAGE_KEY);
        setIsOfflineMode(toBoolean(stored));

        const onStorage = (event) => {
            if (event.key !== OFFLINE_MODE_STORAGE_KEY) return;
            setIsOfflineMode(toBoolean(event.newValue));
        };

        const onCustomModeEvent = (event) => {
            setIsOfflineMode(toBoolean(event?.detail?.enabled));
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener(OFFLINE_MODE_EVENT, onCustomModeEvent);

        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(OFFLINE_MODE_EVENT, onCustomModeEvent);
        };
    }, []);

    const setOfflineMode = useCallback((nextValue) => {
        const enabled = Boolean(nextValue);
        setIsOfflineMode(enabled);

        if (typeof window === "undefined") return;

        window.localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, String(enabled));
        window.dispatchEvent(new CustomEvent(OFFLINE_MODE_EVENT, { detail: { enabled } }));
    }, []);

    const toggleOfflineMode = useCallback(() => {
        setOfflineMode(!isOfflineMode);
    }, [isOfflineMode, setOfflineMode]);

    return {
        isOfflineMode,
        setOfflineMode,
        toggleOfflineMode,
    };
}
