"use client";
/**
 * Hero: Large, bold, animated hero component for DRCP.
 * Alternates between victim and volunteer boxes every 5 seconds with sliding/fading animation.
 * Hidden on mobile, visible on md+ screens.
 */
import React, { useState, useEffect } from "react";

const slides = [
    {
        key: "victim",
        main: "Victims",
        desc: "Get help fast, report incidents, and stay safe. Disaster Connect links you to volunteers and relief teams in real time.",
        color: "from-error/30 via-primary/10 to-accent/10",
        icon: (
            <svg width="36" height="36" viewBox="0 0 24 24" className="text-error">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
                <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        key: "volunteer",
        main: "Volunteers",
        desc: "Find incidents, offer help, and make a difference. Disaster Connect empowers you to support your community when it matters most.",
        color: "from-success/30 via-secondary/10 to-accent/10",
        icon: (
            <svg width="36" height="36" viewBox="0 0 24 24" className="text-success">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
                <path d="M12 8v4l-3 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
];

export default function Hero({ line1, line2, line3, mode = "login" }) {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIdx((prev) => (prev + 1) % slides.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="hero bg-gradient-to-br from-primary/20 via-base-100 to-accent/10 rounded-2xl p-10 hidden md:flex flex-col items-start gap-8 shadow-2xl min-w-[340px] max-w-lg border-2 border-primary/30">
            <div className="flex items-center gap-3 mb-4">
                <svg width="48" height="48" viewBox="0 0 24 24" className="text-primary drop-shadow-lg">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-extrabold text-3xl text-primary drop-shadow-lg tracking-tight">Disaster Connect</span>
            </div>
            <div className="text-2xl font-bold text-accent drop-shadow-lg">{line1}</div>
            <div className="text-lg font-semibold text-base-content">{line2}</div>
            <div className="text-md font-medium text-neutral">{line3}</div>
            {/* Animated sliding/fading box for victim/volunteer */}
            <div className="relative w-full h-42 overflow-hidden">
                {slides.map((slide, i) => (
                    <div
                        key={slide.key}
                        className={`absolute top-0 left-0 w-full h-full flex flex-col px-8 py-6 rounded-xl shadow-xl
                            bg-gradient-to-r ${slide.color}
                            transition-all duration-700 ease-in-out
                            ${i === idx ? "opacity-100 translate-x-0 z-10" : "opacity-0 -translate-x-8 z-0"}
                        `}
                        style={{ pointerEvents: i === idx ? "auto" : "none" }}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className="animate-pulse">{slide.icon}</div>
                            <div className="font-bold text-2xl text-base-100 bg-primary/80 px-3 rounded drop-shadow">
                                {slide.main}
                            </div>
                        </div>
                        <div className="flex-1 flex items-start">
                            <div className="text-base font-medium text-base-content">{slide.desc}</div>
                        </div>
                    </div>
                ))}
                {/* Shining effect */}
            </div>
            {/* Small anchor at the end */}
            <div className="mt-2 text-xs text-primary-content">
                {mode === "login"
                    ? <a href="/register" className="link link-primary font-semibold underline underline-offset-2">
                        Register with us and join the movement.
                    </a> :
                    <a href="/login" className="link link-primary font-semibold underline underline-offset-2">
                        Already have an account? login here.
                    </a>
                }

            </div>
        </div>
    );
}
