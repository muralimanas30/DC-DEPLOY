"use client"
import Link from "next/link";
import Logout from "./form/Logout";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Breadcrumbs from "./Breadcrumbs";

export default function Navbar() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [theme, setTheme] = useState("dark");

    useEffect(() => {
        if (typeof window === "undefined") return;
        sessionStorage.setItem("theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    const handleThemeToggle = () => {
        const nextTheme = theme === "light" ? "dark" : "light";
        setTheme(nextTheme);
    };

    const navLinks = useMemo(() => {
        if (!session?.user) return [];

        return [
            { href: "/incidents", label: "Incidents" },
            { href: "/profile", label: "Profile" },
        ];
    }, [session?.user]);

    const activeRole = session?.user?.activeRole || session?.user?.role || "guest";
    const firstName = (session?.user?.name || "Guest").trim().split(/\s+/)[0];

    const getRoleLabel = (role) => {
        if (!role) return "Guest";
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    const normalizedPath = useMemo(() => {
        if (!pathname) return "/";
        const withoutQuery = pathname.split("?")[0];
        if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
            return withoutQuery.slice(0, -1);
        }
        return withoutQuery;
    }, [pathname]);

    const isActiveLink = (href) => {
        if (!normalizedPath) return false;
        if (href === "/") return normalizedPath === "/" || normalizedPath === "/dashboard";
        return normalizedPath === href || normalizedPath.startsWith(`${href}/`);
    };

    const breadcrumbItems = useMemo(() => {
        if (!normalizedPath || normalizedPath === "/") {
            return [{ label: "Home" }];
        }

        const labelMap = {
            incidents: "Incidents",
            profile: "Profile",
            dashboard: "Dashboard",
            login: "Login",
            register: "Register",
        };

        const objectIdRegex = /^[a-f\d]{24}$/i;
        const segments = normalizedPath.split("/").filter(Boolean);
        const items = [{ label: "Home", href: "/" }];
        let cumulative = "";

        segments.forEach((segment, idx) => {
            cumulative += `/${segment}`;
            const isLast = idx === segments.length - 1;
            const prevSegment = segments[idx - 1] || "";

            let label = labelMap[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
            if (objectIdRegex.test(segment)) {
                label = prevSegment === "incidents" ? "Your Incident" : "Details";
            }

            items.push({
                label,
                href: isLast ? undefined : cumulative,
            });
        });

        return items;
    }, [normalizedPath]);

    return (
        <nav className="w-full bg-base-100 shadow-lg border-b border-base-300">
            <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-base-300 bg-base-300/40">
                <div />

                <div className="flex justify-center">
                    <Link href="/" className="flex items-center gap-2 cursor-pointer">
                        <svg width="32" height="32" viewBox="0 0 24 24" className="text-primary">
                        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
                        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-bold text-xl text-primary">Disaster Connect</span>
                    </Link>
                </div>

                <div className="justify-self-end text-sm font-medium text-base-content/80">
                    <span className="opacity-70">{getRoleLabel(activeRole)}</span>
                    <span className="mx-2">•</span>
                    <span>{firstName}</span>
                </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-base-200 border-b border-base-300">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {navLinks.map((link) => {
                        const active = isActiveLink(link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                                    active
                                        ? "border-primary bg-primary text-primary-content shadow-sm"
                                        : "border-base-300 bg-base-100 hover:border-primary/60 hover:bg-base-100"
                                }`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
                    <button
                        className="btn btn-outline btn-sm"
                        aria-label="Toggle dark/light mode"
                        onClick={handleThemeToggle}
                    >
                        {theme === "light" ? (
                            <span className="flex items-center gap-1">
                                <svg width="20" height="20" viewBox="0 0 24 24" className="text-warning"><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M6.34 17.66l-1.41 1.41M17.66 17.66l-1.41-1.41M6.34 6.34L4.93 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                Light
                            </span>
                        ) : (
                            <span className="flex items-center gap-1">
                                <svg width="20" height="20" viewBox="0 0 24 24" className="text-info"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                Dark
                            </span>
                        )}
                    </button>

                    {session?.user ? (
                        <Logout />
                    ) : (
                        <>
                            <Link href="/login" className="btn btn-outline btn-primary btn-sm">Login</Link>
                            <Link href="/register" className="btn btn-primary btn-sm">Register</Link>
                        </>
                    )}
                </div>
            </div>

            <div className="px-4 py-2 bg-base-100 border-b border-base-300/80">
                <Breadcrumbs items={breadcrumbItems} />
            </div>
        </nav>
    );
}