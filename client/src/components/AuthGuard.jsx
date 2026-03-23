"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const PUBLIC_ROUTES = new Set(["/", "/dashboard", "/login", "/register"]);

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

    return children;
}
