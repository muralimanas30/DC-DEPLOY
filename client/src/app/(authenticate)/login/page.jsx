"use client";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import AuthForm from "../../../components/SignIn";
import Hero from "../../../components/Hero";

export default function LoginPage() {
    const { user, success } = useSelector((state) => state.user);
    const router = useRouter();

    useEffect(() => {
        if (user) {
            router.replace("/dashboard");
        }
    }, [user, router]);

    useEffect(() => {
        if (success === "Registration successful! You can now log in.") {
            router.replace("/login");
        }
    }, [success, router]);

    return (
        <div className=" flex flex-col md:flex-row items-center justify-center min-h-screen gap-8">
            <div className="w-full max-w-md bg-gradient-to-br from-primary/20 via-base-100 to-accent/10 rounded-2xl p-10 shadow-2xl border-2 border-primary/30">
                <h1 className="text-2xl font-bold mb-4">Login</h1>
                <p className="mb-6 text-base">
                    Welcome back! Log in to connect with your community, report incidents, join relief efforts, and stay updated in real time. Your account keeps you safe, informed, and empowered during disasters.
                </p>
                <AuthForm mode="login" />
            </div>
            {/* Animated vertical divider, only on md+ screens */}
            <div className="hidden md:flex h-[320px]">
                <div className="w-2 flex items-center justify-center">
                    <span className="block h-full w-1 rounded-full bg-gradient-to-b from-primary via-accent to-secondary animate-pulse"></span>
                </div>
            </div>
            <Hero
                line1="Welcome to Disaster Connect"
                line2="Join, report, and help coordinate relief efforts."
                line3="Secure, real-time, and community-driven."
            />
        </div>
    );
}
