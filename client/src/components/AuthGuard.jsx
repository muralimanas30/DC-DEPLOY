"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const PUBLIC_ROUTES = new Set(["/", "/dashboard", "/login", "/register", "/offline-report"]);
const BACKEND_WARMUP_ACK_KEY = "backend.warmup.ack.v1";
const WARMUP_SECONDS = 60;

function normalizePath(pathname) {
    if (!pathname) return "/";
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname;
}

function isPublicRoute(pathname) {
    const normalized = normalizePath(pathname);
    if (PUBLIC_ROUTES.has(normalized)) return true;
    if (normalized.startsWith("/dashboard/")) return true;
    return false;
}

export default function AuthGuard({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const [showWarmupNotice, setShowWarmupNotice] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARMUP_SECONDS);
    const [showRecoveryToast, setShowRecoveryToast] = useState(false);
    const hasDetectedOutageRef = useRef(false);

    const publicRoute = isPublicRoute(pathname);

    useEffect(() => {
        if (status === "loading") return;

        if (status === "unauthenticated" && !publicRoute) {
            router.replace("/login");
        }
    }, [status, publicRoute, router]);

    useEffect(() => {
        if (status !== "authenticated") return;

        let cancelled = false;

        const verifySession = async () => {
            try {
                const res = await fetch("/api/incidents?page=1&limit=1", {
                    method: "GET",
                    cache: "no-store",
                });

                if (cancelled) return;

                if (res.status === 401) {
                    await signOut({ redirect: false });
                    if (!publicRoute) {
                        router.replace("/login");
                    }
                }
            } catch {
                // Ignore transient network failures; auth redirects are handled by request flows.
            }
        };

        verifySession();

        return () => {
            cancelled = true;
        };
    }, [status, pathname, publicRoute, router, session?.user?.token]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const alreadyAcknowledged = sessionStorage.getItem(BACKEND_WARMUP_ACK_KEY) === "1";
        if (alreadyAcknowledged) {
            return;
        }

        let cancelled = false;
        let pollId = null;
        let countdownId = null;

        const clearTimers = () => {
            if (pollId) {
                clearInterval(pollId);
                pollId = null;
            }
            if (countdownId) {
                clearInterval(countdownId);
                countdownId = null;
            }
        };

        const startWarmupUi = () => {
            if (hasDetectedOutageRef.current) return;

            hasDetectedOutageRef.current = true;
            setShowWarmupNotice(true);
            setSecondsLeft(WARMUP_SECONDS);

            countdownId = setInterval(() => {
                setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        };

        const onRecovered = () => {
            sessionStorage.setItem(BACKEND_WARMUP_ACK_KEY, "1");
            setShowWarmupNotice(false);
            clearTimers();

            if (hasDetectedOutageRef.current) {
                setShowRecoveryToast(true);
                setTimeout(() => {
                    if (!cancelled) {
                        setShowRecoveryToast(false);
                    }
                }, 4500);
            }
        };

        const probeBackend = async () => {
            try {
                const res = await fetch("/api/health", {
                    method: "GET",
                    cache: "no-store",
                });

                if (cancelled) return;

                if (res.ok) {
                    onRecovered();
                    return;
                }

                startWarmupUi();
            } catch {
                if (!cancelled) {
                    startWarmupUi();
                }
            }
        };

        probeBackend();

        pollId = setInterval(() => {
            probeBackend();
        }, 5000);

        return () => {
            cancelled = true;
            clearTimers();
        };
    }, []);

    return (
        <>
            {showWarmupNotice ? (
                <div className="fixed bottom-5 right-5 z-70 max-w-sm rounded-lg border border-warning/30 bg-base-100 p-4 shadow-xl">
                    <div className="text-sm font-semibold text-warning">Server is starting up</div>
                    <div className="mt-1 text-sm text-base-content/80">
                        Please wait for 1 minute while we connect.
                    </div>
                    <div className="mt-2 text-xs text-base-content/70">
                        {secondsLeft > 0
                            ? `Retrying... ${secondsLeft}s`
                            : "Still starting. We will auto-connect once it is online."}
                    </div>
                </div>
            ) : null}

            {showRecoveryToast ? (
                <div className="fixed bottom-5 right-5 z-80 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success shadow-lg">
                    Backend is online. You can continue.
                </div>
            ) : null}

            {children}
        </>
    );
}
