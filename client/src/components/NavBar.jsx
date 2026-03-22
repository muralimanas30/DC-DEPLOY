"use client"
/**
 * Disaster Connect Navbar
 * Responsive two-row navbar:
 * - Top row: logo only (centered on mobile, left on desktop)
 * - Second row: user info, theme toggle, login/register/logout, and nav links (menu on mobile)
 */
import Link from "next/link";
import Logout from "./form/Logout";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
export default function Navbar() {
    const { data: session, status } = useSession()
    useEffect(() => {
        if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem("theme");
            // if (stored) setTheme(stored);
            document.documentElement.setAttribute("data-theme", stored || "dark");
        }
    }, []);

    const handleThemeToggle = () => {
        if (typeof window !== "undefined") {
            sessionStorage.setItem("theme", newTheme);
            document.documentElement.setAttribute("data-theme", newTheme);
        }
    };

    // const handleLogout = () => {
    //     dispatch(logout());
    // };

    // Navigation links for menu
    const navLinks = [
        { href: "/incidents", label: "Incidents" },
        { href: "/dashboard", label: "Dashboard" },
        { href: "/profile", label: "Profile" },
    ];
    return (
        <nav className="w-full bg-base-200 shadow-lg">
            {/* Top Row: Logo only */}
            <div className="flex justify-center items-center px-4 py-2 border-b border-base-300">
                <Link href="/" className="flex items-center gap-2 cursor-pointer">
                    <svg width="32" height="32" viewBox="0 0 24 24" className="text-primary">
                        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
                        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-bold text-xl text-primary">Disaster Connect</span>
                </Link>
            </div>
            {/* Second Row: User info, theme, login/logout, nav menu */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-2 gap-2">
                {/* Left: User info, theme, login/logout */}
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <button
                        className="btn btn-ghost btn-sm"
                        aria-label="Toggle dark/light mode"
                        onClick={handleThemeToggle}
                    >
                        {"light" ? (
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

                    {session?.user ?
                        <Logout />
                        :
                        <Link href="/login" className="btn btn-outline btn-primary btn-sm w-full sm:w-auto">Login</Link>
                    }
                </div>
            </div>
        </nav>
    );
}