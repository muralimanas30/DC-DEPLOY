"use client";

import { useEffect, useMemo, useState } from "react";

function isStandaloneMode() {
    if (typeof window === "undefined") return false;
    const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const iosStandalone = window.navigator?.standalone === true;
    return Boolean(mediaStandalone || iosStandalone);
}

function getManualInstallHelp() {
    if (typeof window === "undefined") {
        return "Use your browser menu and choose Install app / Add to Home screen.";
    }

    const ua = window.navigator?.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);

    if (isIOS) {
        return "On iPhone/iPad: tap Share, then Add to Home Screen.";
    }

    return "On Android: open browser menu (⋮) and choose Install app / Add to Home screen.";
}

export default function InstallAppCard() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installed, setInstalled] = useState(false);
    const [helpMessage, setHelpMessage] = useState("");

    useEffect(() => {
        if (typeof window === "undefined") return;
        setInstalled(isStandaloneMode());

        const onBeforeInstallPrompt = (event) => {
            event.preventDefault();
            setDeferredPrompt(event);
        };

        const onInstalled = () => {
            setDeferredPrompt(null);
            setInstalled(true);
            setHelpMessage("");
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("appinstalled", onInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const canNativeInstall = Boolean(deferredPrompt);

    const statusText = useMemo(() => {
        if (installed) return "Installed";
        if (canNativeInstall) return "Ready to install";
        if (typeof window !== "undefined" && !window.isSecureContext) {
            return "Requires HTTPS for native install prompt";
        }
        return "Manual install available";
    }, [installed, canNativeInstall]);

    const onInstallClick = async () => {
        setHelpMessage("");

        if (installed) {
            setHelpMessage("App is already installed on this device.");
            return;
        }

        if (!deferredPrompt) {
            setHelpMessage(getManualInstallHelp());
            return;
        }

        setIsInstalling(true);
        try {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
        } finally {
            setDeferredPrompt(null);
            setIsInstalling(false);
        }
    };

    return (
        <article className="card bg-base-100 border border-base-300 shadow-lg">
            <div className="card-body">
                <h3 className="card-title text-lg">Install App</h3>
                <p className="text-sm text-base-content/70">
                    Add Disaster Connect to your home screen for faster launch and better offline reliability.
                </p>

                <div className="badge badge-outline w-fit">{statusText}</div>

                <button
                    type="button"
                    className="btn btn-outline btn-sm mt-2"
                    onClick={onInstallClick}
                    disabled={isInstalling}
                >
                    {isInstalling ? "Opening Install..." : "Install App"}
                </button>

                {helpMessage ? (
                    <div className="mt-2 text-xs text-base-content/70">{helpMessage}</div>
                ) : null}
            </div>
        </article>
    );
}